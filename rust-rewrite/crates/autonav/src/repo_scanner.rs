//! Repository scanning utilities

use std::path::{Path, PathBuf};
use std::collections::HashSet;

use ignore::WalkBuilder;
use tracing::{debug, info};

use crate::errors::Result;

/// File information from a scan
#[derive(Debug, Clone)]
pub struct FileInfo {
    pub path: PathBuf,
    pub relative_path: String,
    pub size: u64,
    pub is_markdown: bool,
}

/// Repository scan result
#[derive(Debug, Clone)]
pub struct ScanResult {
    pub files: Vec<FileInfo>,
    pub total_files: usize,
    pub total_size: u64,
    pub markdown_files: usize,
}

/// Scan a repository for documentation files
pub fn scan_repository(
    path: &Path,
    max_depth: Option<usize>,
) -> Result<ScanResult> {
    info!("Scanning repository: {:?}", path);

    let mut files = Vec::new();
    let mut total_size = 0u64;
    let mut markdown_count = 0usize;

    // Build walker that respects .gitignore
    let mut builder = WalkBuilder::new(path);
    builder.hidden(false)  // Include hidden files
           .git_ignore(true)  // Respect .gitignore
           .git_global(true)  // Respect global gitignore
           .git_exclude(true);  // Respect .git/info/exclude

    if let Some(depth) = max_depth {
        builder.max_depth(Some(depth));
    }

    // Additional patterns to ignore
    let ignore_patterns: HashSet<&str> = [
        "node_modules",
        "target",
        ".git",
        "dist",
        "build",
        "__pycache__",
        ".next",
        "coverage",
        ".cache",
    ].iter().copied().collect();

    for entry in builder.build() {
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                debug!("Error walking: {}", e);
                continue;
            }
        };

        let file_path = entry.path();

        // Skip directories
        if file_path.is_dir() {
            continue;
        }

        // Skip if in ignored directory
        if file_path.components().any(|c| {
            if let std::path::Component::Normal(name) = c {
                ignore_patterns.contains(name.to_str().unwrap_or(""))
            } else {
                false
            }
        }) {
            continue;
        }

        // Get file metadata
        let metadata = match std::fs::metadata(file_path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        let size = metadata.len();
        total_size += size;

        let relative_path = file_path
            .strip_prefix(path)
            .unwrap_or(file_path)
            .to_string_lossy()
            .to_string();

        let is_markdown = file_path
            .extension()
            .map_or(false, |ext| ext == "md" || ext == "mdx");

        if is_markdown {
            markdown_count += 1;
        }

        files.push(FileInfo {
            path: file_path.to_path_buf(),
            relative_path,
            size,
            is_markdown,
        });
    }

    let result = ScanResult {
        total_files: files.len(),
        total_size,
        markdown_files: markdown_count,
        files,
    };

    info!(
        "Scan complete: {} files, {} markdown, {} bytes",
        result.total_files, result.markdown_files, result.total_size
    );

    Ok(result)
}

/// Get suggested knowledge paths from a scan result
pub fn suggest_knowledge_paths(scan: &ScanResult) -> Vec<String> {
    let mut suggestions = Vec::new();
    let mut seen_dirs: HashSet<String> = HashSet::new();

    // Look for common documentation directories
    let doc_dirs = ["docs", "doc", "documentation", "wiki", "knowledge", "guides"];

    for file in &scan.files {
        if file.is_markdown {
            // Get parent directory
            if let Some(parent) = Path::new(&file.relative_path).parent() {
                let parent_str = parent.to_string_lossy().to_string();

                // Check if it's a known doc directory
                for doc_dir in &doc_dirs {
                    if parent_str.starts_with(doc_dir) && !seen_dirs.contains(&parent_str) {
                        seen_dirs.insert(parent_str.clone());
                        suggestions.push(parent_str);
                        break;
                    }
                }
            }
        }
    }

    // If no specific doc directories found, suggest root-level markdown files
    if suggestions.is_empty() && scan.markdown_files > 0 {
        suggestions.push(".".to_string());
    }

    suggestions
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_scan_repository() {
        let temp = TempDir::new().unwrap();
        let path = temp.path();

        // Create some test files
        std::fs::write(path.join("README.md"), "# Test").unwrap();
        std::fs::write(path.join("main.rs"), "fn main() {}").unwrap();
        std::fs::create_dir(path.join("docs")).unwrap();
        std::fs::write(path.join("docs/guide.md"), "# Guide").unwrap();

        let result = scan_repository(path, None).unwrap();
        assert_eq!(result.total_files, 3);
        assert_eq!(result.markdown_files, 2);
    }

    #[test]
    fn test_suggest_knowledge_paths() {
        let scan = ScanResult {
            files: vec![
                FileInfo {
                    path: PathBuf::from("docs/guide.md"),
                    relative_path: "docs/guide.md".to_string(),
                    size: 100,
                    is_markdown: true,
                },
                FileInfo {
                    path: PathBuf::from("docs/api.md"),
                    relative_path: "docs/api.md".to_string(),
                    size: 200,
                    is_markdown: true,
                },
            ],
            total_files: 2,
            total_size: 300,
            markdown_files: 2,
        };

        let suggestions = suggest_knowledge_paths(&scan);
        assert!(suggestions.contains(&"docs".to_string()));
    }
}
