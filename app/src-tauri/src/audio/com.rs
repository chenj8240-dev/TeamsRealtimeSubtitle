//! COM apartment membership for the threads this crate spawns to talk to WASAPI directly.

use std::marker::PhantomData;

/// The calling thread's membership of COM's multithreaded apartment, left again on drop.
///
/// Declare it before any COM object the thread creates: locals drop in reverse order, so the
/// thread then leaves COM only after the last of them is released. Only for threads this
/// crate spawns. A pooled thread may already belong to cpal's single-threaded apartment,
/// where joining fails with `RPC_E_CHANGED_MODE`, and leaving would pull COM out from under
/// cpal.
pub struct Apartment {
    /// Not `Send`: the membership belongs to the thread that joined, which must also leave.
    _thread: PhantomData<*const ()>,
}

impl Apartment {
    /// Join the multithreaded apartment. A failed join returns no guard, so it is never
    /// balanced by a leave.
    pub fn mta() -> anyhow::Result<Self> {
        // `initialize_mta` returns an `HRESULT`; `.ok()` turns it into a
        // `windows::core::Result` that anyhow accepts.
        wasapi::initialize_mta().ok()?;
        Ok(Self {
            _thread: PhantomData,
        })
    }
}

impl Drop for Apartment {
    fn drop(&mut self) {
        wasapi::deinitialize();
    }
}
