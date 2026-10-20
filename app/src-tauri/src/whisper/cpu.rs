//! Whether this processor can run the Whisper engine that was compiled into the app.
//!
//! ggml's CPU library is built for a fixed instruction-set level (`.cargo/config.toml`), not
//! dispatched at runtime, so on an older processor its first matrix operation would be an
//! illegal instruction and take the whole app down. This check runs before anything native is
//! touched — model load, context creation, the smoke test — and the interface asks for it
//! before offering Start, so such a PC is told plainly and steered to another engine.
use std::sync::OnceLock;

use serde::Serialize;

/// What the operator window is told before it offers Start.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuSupport {
    pub supported: bool,
    /// The required extensions this processor lacks, in display form. Empty when supported.
    pub missing: Vec<String>,
}

/// x64: clang-cl compiles ggml-cpu with `/arch:AVX2`, which it treats as Haswell. AVX2, FMA and
/// F16C are what ggml uses on purpose; the rest of the Haswell set is what the compiler is then
/// free to emit on its own, so a processor lacking any of it is just as unsafe.
#[cfg(target_arch = "x86_64")]
pub const REQUIRED: &[&str] = &[
    "sse4.2", "popcnt", "avx", "avx2", "fma", "f16c", "bmi1", "bmi2", "lzcnt", "movbe",
];

/// ARM64: built for `armv8.2-a+dotprod+fp16`, but only dot-product is checked. Windows answers
/// these questions through `IsProcessorFeaturePresent`, and its FP16 flag only exists on recent
/// builds — older ones report it absent on processors that have it, which would refuse Whisper
/// on perfectly capable machines. Every Windows-on-ARM SoC with dot-product (Snapdragon 850 and
/// later) also has FP16, so dot-product alone separates the two generations.
#[cfg(target_arch = "aarch64")]
pub const REQUIRED: &[&str] = &["dotprod"];

/// Nothing ships for other architectures; ggml's defaults there need no gate.
#[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64")))]
pub const REQUIRED: &[&str] = &[];

/// `None` for a name this table does not know, which counts as missing: a typo in `REQUIRED`
/// fails closed, and a test below catches it before it can refuse every processor.
#[cfg(target_arch = "x86_64")]
fn detected(feature: &str) -> Option<bool> {
    // The detection macro only takes literals, hence the table.
    Some(match feature {
        "sse4.2" => std::arch::is_x86_feature_detected!("sse4.2"),
        "popcnt" => std::arch::is_x86_feature_detected!("popcnt"),
        "avx" => std::arch::is_x86_feature_detected!("avx"),
        "avx2" => std::arch::is_x86_feature_detected!("avx2"),
        "fma" => std::arch::is_x86_feature_detected!("fma"),
        "f16c" => std::arch::is_x86_feature_detected!("f16c"),
        "bmi1" => std::arch::is_x86_feature_detected!("bmi1"),
        "bmi2" => std::arch::is_x86_feature_detected!("bmi2"),
        "lzcnt" => std::arch::is_x86_feature_detected!("lzcnt"),
        "movbe" => std::arch::is_x86_feature_detected!("movbe"),
        _ => return None,
    })
}

#[cfg(target_arch = "aarch64")]
fn detected(feature: &str) -> Option<bool> {
    match feature {
        "dotprod" => Some(std::arch::is_aarch64_feature_detected!("dotprod")),
        _ => None,
    }
}

#[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64")))]
fn detected(_feature: &str) -> Option<bool> {
    None
}

/// The pure part of the check: which of `required` the processor lacks.
fn evaluate(required: &[&str], has: impl Fn(&str) -> Option<bool>) -> CpuSupport {
    let missing: Vec<String> = required
        .iter()
        .filter(|feature| has(feature) != Some(true))
        .map(|feature| feature.to_uppercase())
        .collect();
    CpuSupport {
        supported: missing.is_empty(),
        missing,
    }
}

/// This processor's answer, worked out once: the hardware does not change while the app runs.
pub fn support() -> &'static CpuSupport {
    static SUPPORT: OnceLock<CpuSupport> = OnceLock::new();
    SUPPORT.get_or_init(|| evaluate(REQUIRED, detected))
}

/// The refusal, as a typed error so the command layer can give it its own sentence.
#[derive(Debug)]
pub struct Unsupported(pub Vec<String>);

impl std::fmt::Display for Unsupported {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "missing {}", self.0.join(", "))
    }
}

impl std::error::Error for Unsupported {}

/// Call before any whisper.cpp or ggml code runs.
pub fn ensure_supported() -> Result<(), Unsupported> {
    let support = support();
    if support.supported {
        Ok(())
    } else {
        Err(Unsupported(support.missing.clone()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_exactly_the_missing_extensions_in_display_form() {
        let support = evaluate(&["avx", "avx2", "sse4.2"], |f| Some(f == "sse4.2"));
        assert!(!support.supported);
        assert_eq!(support.missing, ["AVX", "AVX2"]);
        // A name nothing can detect is treated as absent, never as present.
        assert_eq!(evaluate(&["avx3"], |_| None).missing, ["AVX3"]);

        let support = evaluate(&["dotprod"], |_| Some(true));
        assert_eq!(
            support,
            CpuSupport {
                supported: true,
                missing: Vec::new()
            }
        );
        assert!(evaluate(&[], |_| None).supported);
    }

    #[test]
    fn serializes_for_the_operator_window() {
        let json = serde_json::to_string(&evaluate(&["avx2"], |_| Some(false))).unwrap();
        assert_eq!(json, r#"{"supported":false,"missing":["AVX2"]}"#);
        assert_eq!(Unsupported(vec!["AVX".into()]).to_string(), "missing AVX");
    }

    #[test]
    fn every_required_extension_has_a_detector() {
        for feature in REQUIRED {
            assert!(detected(feature).is_some(), "{feature} has no detector");
        }
        #[cfg(target_arch = "x86_64")]
        assert_eq!(REQUIRED.len(), 10);
        #[cfg(target_arch = "aarch64")]
        assert_eq!(REQUIRED, ["dotprod"]);
    }

    /// CI's x64 and ARM64 runners, and every development machine, are modern enough. If this
    /// fails locally, the build's instruction sets are ahead of this PC — see `.cargo/config.toml`.
    #[test]
    fn this_machine_is_supported_and_the_gate_lets_it_through() {
        assert_eq!(support().missing, Vec::<String>::new());
        assert!(ensure_supported().is_ok());
    }

    /// Run only under Intel SDE emulating a processor without AVX (CI uses Goldmont Plus, the
    /// core in cheap Windows 11 Celeron and Pentium Silver laptops). Getting here at all shows
    /// the test binary starts without executing AVX code; the assertions show the gate refuses.
    #[test]
    #[ignore = "run under Intel SDE with a pre-AVX CPU model; see .github/workflows/ci.yml"]
    fn refuses_a_processor_without_avx() {
        let support = support();
        eprintln!("emulated processor lacks: {:?}", support.missing);
        assert!(!support.supported);
        assert!(support.missing.iter().any(|f| f == "AVX"));
        assert!(ensure_supported().is_err());
    }
}
