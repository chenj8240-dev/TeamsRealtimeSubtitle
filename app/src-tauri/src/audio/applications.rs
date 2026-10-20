//! Explicit process selection. Creation time prevents a recycled PID capturing another app.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProcessIdentity {
    pub pid: u32,
    pub created_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum SystemCapture {
    #[default]
    Output,
    Application {
        process: Option<ProcessIdentity>,
    },
}

#[derive(Debug, Serialize)]
pub struct Application {
    pub process: ProcessIdentity,
    pub name: String,
}
#[derive(Debug, Serialize)]
pub struct ApplicationList {
    pub supported: bool,
    pub applications: Vec<Application>,
}

pub fn validate(capture: &SystemCapture) -> anyhow::Result<()> {
    if let SystemCapture::Application { process } = capture {
        let identity = process
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("select an application before starting capture"))?;
        #[cfg(windows)]
        let _ = ProcessGuard::selected(identity)?;
        #[cfg(not(windows))]
        {
            let _ = identity;
            anyhow::bail!("application capture requires Windows");
        }
    }
    Ok(())
}

#[cfg(not(windows))]
#[allow(
    clippy::unnecessary_wraps,
    reason = "the Windows build's signature, which can fail"
)]
pub fn list() -> anyhow::Result<ApplicationList> {
    Ok(ApplicationList {
        supported: false,
        applications: vec![],
    })
}

#[cfg(windows)]
pub use platform::{list, ProcessGuard};

#[cfg(windows)]
mod platform {
    use super::*;
    use windows_sys::Win32::Foundation::{
        CloseHandle, FILETIME, HANDLE, HWND, LPARAM, WAIT_TIMEOUT,
    };
    use windows_sys::Win32::System::Threading::{
        GetProcessTimes, OpenProcess, WaitForSingleObject, PROCESS_QUERY_LIMITED_INFORMATION,
        PROCESS_SYNCHRONIZE,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
    };

    pub struct ProcessGuard(HANDLE);
    impl Drop for ProcessGuard {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
    impl ProcessGuard {
        fn open(pid: u32) -> anyhow::Result<Self> {
            anyhow::ensure!(
                pid != 0 && pid != std::process::id(),
                "invalid capture application"
            );
            let handle = unsafe {
                OpenProcess(
                    PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE,
                    0,
                    pid,
                )
            };
            anyhow::ensure!(!handle.is_null(), "selected application is unavailable");
            Ok(Self(handle))
        }
        fn identity(&self, pid: u32) -> anyhow::Result<ProcessIdentity> {
            let mut created = FILETIME::default();
            let mut exit = FILETIME::default();
            let mut kernel = FILETIME::default();
            let mut user = FILETIME::default();
            anyhow::ensure!(
                unsafe { GetProcessTimes(self.0, &mut created, &mut exit, &mut kernel, &mut user) }
                    != 0,
                "cannot identify application"
            );
            Ok(ProcessIdentity {
                pid,
                created_at: ((u64::from(created.dwHighDateTime) << 32)
                    | u64::from(created.dwLowDateTime))
                .to_string(),
            })
        }
        pub fn selected(identity: &ProcessIdentity) -> anyhow::Result<Self> {
            anyhow::ensure!(
                supported(),
                "application capture requires Windows build 20348 or later"
            );
            let guard = Self::open(identity.pid)?;
            anyhow::ensure!(
                guard.identity(identity.pid)? == *identity && guard.running(),
                "selected application has closed or restarted; select it again"
            );
            Ok(guard)
        }
        pub fn running(&self) -> bool {
            unsafe { WaitForSingleObject(self.0, 0) == WAIT_TIMEOUT }
        }
    }
    fn supported() -> bool {
        use windows_sys::Win32::System::SystemInformation::OSVERSIONINFOW;
        #[expect(
            clippy::cast_possible_truncation,
            reason = "a Win32 structure of a few hundred bytes"
        )]
        let mut version = OSVERSIONINFOW {
            dwOSVersionInfoSize: std::mem::size_of::<OSVERSIONINFOW>() as u32,
            ..Default::default()
        };
        unsafe {
            windows_sys::Wdk::System::SystemServices::RtlGetVersion(&mut version) >= 0
                && version.dwBuildNumber >= 20348
        }
    }
    unsafe extern "system" fn visit(window: HWND, data: LPARAM) -> i32 {
        if IsWindowVisible(window) == 0 {
            return 1;
        }
        let mut title = [0u16; 512];
        #[expect(
            clippy::cast_possible_truncation,
            clippy::cast_possible_wrap,
            reason = "the buffer is 512 units long"
        )]
        let length = GetWindowTextW(window, title.as_mut_ptr(), title.len() as i32);
        // Zero for an untitled window or a failure; never documented as negative.
        let Some(length) = usize::try_from(length).ok().filter(|&n| n > 0) else {
            return 1;
        };
        let mut pid = 0;
        GetWindowThreadProcessId(window, &mut pid);
        let apps = &mut *(data as *mut Vec<Application>);
        if apps.iter().any(|app| app.process.pid == pid) {
            return 1;
        }
        if let Ok(guard) = ProcessGuard::open(pid) {
            if let Ok(process) = guard.identity(pid) {
                if guard.running() {
                    apps.push(Application {
                        process,
                        name: String::from_utf16_lossy(&title[..length]),
                    });
                }
            }
        }
        1
    }
    pub fn list() -> anyhow::Result<ApplicationList> {
        if !supported() {
            return Ok(ApplicationList {
                supported: false,
                applications: vec![],
            });
        }
        let mut applications = Vec::<Application>::new();
        anyhow::ensure!(
            unsafe { EnumWindows(Some(visit), &mut applications as *mut _ as LPARAM) } != 0,
            "cannot list applications"
        );
        applications.sort_by_key(|app| app.name.to_lowercase());
        Ok(ApplicationList {
            supported: true,
            applications,
        })
    }

    #[cfg(test)]
    #[test]
    fn native_process_client_starts_without_endpoint_queries_and_rejects_pid_reuse() {
        use std::os::windows::process::CommandExt;
        use std::process::{Command, Stdio};
        if !supported() {
            return;
        }
        struct Child(std::process::Child);
        impl Drop for Child {
            fn drop(&mut self) {
                let _ = self.0.kill();
                let _ = self.0.wait();
            }
        }
        let executable = std::path::PathBuf::from(std::env::var_os("SystemRoot").unwrap())
            .join("System32/cmd.exe");
        // A silent, hidden process owned by this test; no user's application is captured.
        let child = Child(
            Command::new(executable)
                .args(["/C", "pause"])
                .creation_flags(0x08000000)
                .stdin(Stdio::piped())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .unwrap(),
        );
        let guard = ProcessGuard::open(child.0.id()).unwrap();
        let identity = guard.identity(child.0.id()).unwrap();
        assert!(ProcessGuard::selected(&ProcessIdentity {
            created_at: "0".into(),
            ..identity.clone()
        })
        .is_err());
        let cancel = tokio_util::sync::CancellationToken::new();
        cancel.cancel();
        let (levels, _) = tokio::sync::mpsc::channel(1);
        let (chunks, _) = tokio::sync::mpsc::channel(1);
        let result = std::thread::spawn(move || {
            crate::audio::loopback::run_system_loopback(
                None,
                SystemCapture::Application {
                    process: Some(identity),
                },
                16000,
                levels,
                chunks.into(),
                &cancel,
            )
        })
        .join()
        .unwrap();
        result.unwrap();
        drop(child);
        assert!(!guard.running());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn application_without_selection_never_means_output() {
        let target: SystemCapture =
            serde_json::from_str(r#"{"kind":"application","process":null}"#).unwrap();
        assert!(matches!(
            target,
            SystemCapture::Application { process: None }
        ));
        assert!(validate(&target).is_err());
        assert!(validate(&SystemCapture::Output).is_ok());
        assert!(serde_json::from_str::<SystemCapture>(r#"{"kind":"unknown"}"#).is_err());
    }
    #[cfg(windows)]
    #[test]
    fn enumeration_and_stale_identity_are_safe() {
        let _ = list().unwrap();
        assert!(ProcessGuard::selected(&ProcessIdentity {
            pid: std::process::id(),
            created_at: "0".into()
        })
        .is_err());
    }
}
