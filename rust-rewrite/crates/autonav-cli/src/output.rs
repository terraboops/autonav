//! Output formatting utilities

use owo_colors::OwoColorize;

/// Print a success message
pub fn success(msg: &str) {
    println!("{} {}", "✓".green().bold(), msg);
}

/// Print an info message
pub fn info(msg: &str) {
    println!("{} {}", "ℹ".blue().bold(), msg);
}

/// Print a warning message
pub fn warn(msg: &str) {
    eprintln!("{} {}", "⚠".yellow().bold(), msg);
}

/// Print an error message
pub fn error(msg: &str) {
    eprintln!("{} {}", "✗".red().bold(), msg);
}

/// Print a step in a process
pub fn step(num: usize, total: usize, msg: &str) {
    println!(
        "{} {}",
        format!("[{}/{}]", num, total).dimmed(),
        msg
    );
}

/// Format confidence as a colored percentage
pub fn format_confidence(confidence: f64) -> String {
    let percent = (confidence * 100.0) as u8;
    let text = format!("{}%", percent);

    if confidence >= 0.8 {
        text.green().to_string()
    } else if confidence >= 0.5 {
        text.yellow().to_string()
    } else {
        text.red().to_string()
    }
}

/// Format a source reference
pub fn format_source(file: &str, section: &str, relevance: &str) -> String {
    format!(
        "  {} {} {}\n    {}",
        "•".dimmed(),
        file.cyan(),
        format!("({})", section).dimmed(),
        relevance.dimmed()
    )
}

/// Create a spinner with a message
pub fn spinner(msg: &str) -> indicatif::ProgressBar {
    let pb = indicatif::ProgressBar::new_spinner();
    pb.set_style(
        indicatif::ProgressStyle::default_spinner()
            .template("{spinner:.blue} {msg}")
            .unwrap(),
    );
    pb.set_message(msg.to_string());
    pb.enable_steady_tick(std::time::Duration::from_millis(100));
    pb
}
