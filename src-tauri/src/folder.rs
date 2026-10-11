//! Folder pane backend: lists the Markdown files of one folder.

use std::cmp::Ordering;
use std::fs;
use std::path::Path;

#[derive(serde::Serialize, Debug, Clone, PartialEq)]
pub struct FolderFile {
    pub name: String,
    pub path: String,
}

/// Natural, case-insensitive comparison: digit runs are compared numerically.
fn natural_cmp(a: &str, b: &str) -> Ordering {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let (mut i, mut j) = (0, 0);
    while i < a.len() && j < b.len() {
        if a[i].is_ascii_digit() && b[j].is_ascii_digit() {
            let si = i;
            while i < a.len() && a[i].is_ascii_digit() {
                i += 1;
            }
            let sj = j;
            while j < b.len() && b[j].is_ascii_digit() {
                j += 1;
            }
            let da: String = a[si..i].iter().collect::<String>();
            let db: String = b[sj..j].iter().collect::<String>();
            let ta = da.trim_start_matches('0');
            let tb = db.trim_start_matches('0');
            let ord = ta.len().cmp(&tb.len()).then_with(|| ta.cmp(tb));
            if ord != Ordering::Equal {
                return ord;
            }
        } else {
            let ca = a[i].to_lowercase().next().unwrap_or(a[i]);
            let cb = b[j].to_lowercase().next().unwrap_or(b[j]);
            if ca != cb {
                return ca.cmp(&cb);
            }
            i += 1;
            j += 1;
        }
    }
    (a.len() - i).cmp(&(b.len() - j))
}

#[cfg(windows)]
fn is_reparse_point(entry: &fs::DirEntry) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    match entry.metadata() {
        Ok(m) => m.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0,
        Err(_) => true,
    }
}

#[cfg(not(windows))]
fn is_reparse_point(_entry: &fs::DirEntry) -> bool {
    false
}

/// Lists the `.md` files directly inside `dir` (one level, sorted naturally).
///
/// Links are never followed: symlinks, junctions and other reparse points are
/// skipped. On Windows, following a link that points to a UNC path would make
/// Windows offer NTLM credentials to that remote host.
#[tauri::command]
pub fn list_markdown_files(dir: String) -> Result<Vec<FolderFile>, String> {
    let dir_path = Path::new(&dir);
    if !dir_path.exists() {
        return Err(format!("Folder does not exist: {}", dir));
    }
    if !dir_path.is_dir() {
        return Err(format!("Not a folder: {}", dir));
    }
    let entries = fs::read_dir(dir_path).map_err(|e| format!("Cannot read folder {}: {}", dir, e))?;

    let mut files: Vec<FolderFile> = Vec::new();
    for entry in entries {
        let Ok(entry) = entry else { continue };
        let Ok(file_type) = entry.file_type() else { continue };
        if !file_type.is_file() || file_type.is_symlink() || is_reparse_point(&entry) {
            continue;
        }
        let Some(name) = entry.file_name().to_str().map(|s| s.to_string()) else { continue };
        if name.starts_with('.') {
            continue;
        }
        let is_md = Path::new(&name)
            .extension()
            .and_then(|e| e.to_str())
            .map_or(false, |e| e.eq_ignore_ascii_case("md"));
        if !is_md {
            continue;
        }
        let path = dir_path.join(&name).to_string_lossy().into_owned();
        files.push(FolderFile { name, path });
    }
    files.sort_by(|a, b| natural_cmp(&a.name, &b.name).then_with(|| a.name.cmp(&b.name)));
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering as AtomicOrdering};

    static COUNTER: AtomicUsize = AtomicUsize::new(0);

    struct TempDir(PathBuf);
    impl TempDir {
        fn new() -> Self {
            let n = COUNTER.fetch_add(1, AtomicOrdering::SeqCst);
            let p = std::env::temp_dir().join(format!("markpadx_folder_test_{}_{}", std::process::id(), n));
            let _ = fs::remove_dir_all(&p);
            fs::create_dir_all(&p).unwrap();
            TempDir(p)
        }
        fn s(&self) -> String {
            self.0.to_string_lossy().into_owned()
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn names(v: &[FolderFile]) -> Vec<&str> {
        v.iter().map(|f| f.name.as_str()).collect()
    }

    #[test]
    fn lists_only_md_files() {
        let t = TempDir::new();
        for n in ["a.md", "B.MD", "x.markdown", "y.txt", ".hidden.md"] {
            fs::write(t.0.join(n), "x").unwrap();
        }
        fs::create_dir(t.0.join("folder.md")).unwrap();
        fs::create_dir(t.0.join("sub")).unwrap();
        let r = list_markdown_files(t.s()).unwrap();
        assert_eq!(names(&r), vec!["a.md", "B.MD"]);
    }

    #[test]
    fn natural_case_insensitive_order() {
        let t = TempDir::new();
        for n in ["B.md", "10.md", "a.md", "2.md"] {
            fs::write(t.0.join(n), "x").unwrap();
        }
        let r = list_markdown_files(t.s()).unwrap();
        assert_eq!(names(&r), vec!["2.md", "10.md", "a.md", "B.md"]);
    }

    #[test]
    fn one_level_only() {
        let t = TempDir::new();
        fs::write(t.0.join("a.md"), "x").unwrap();
        fs::create_dir(t.0.join("sub")).unwrap();
        fs::write(t.0.join("sub").join("c.md"), "x").unwrap();
        let r = list_markdown_files(t.s()).unwrap();
        assert_eq!(names(&r), vec!["a.md"]);
    }

    #[test]
    fn missing_and_file_paths_error() {
        let t = TempDir::new();
        assert!(list_markdown_files(t.0.join("nope").to_string_lossy().into_owned()).is_err());
        let f = t.0.join("a.md");
        fs::write(&f, "x").unwrap();
        assert!(list_markdown_files(f.to_string_lossy().into_owned()).is_err());
    }

    #[test]
    fn path_is_dir_joined_with_name() {
        let t = TempDir::new();
        fs::write(t.0.join("a.md"), "x").unwrap();
        let r = list_markdown_files(t.s()).unwrap();
        assert_eq!(r[0].path, Path::new(&t.s()).join("a.md").to_string_lossy());
    }

    #[cfg(windows)]
    #[test]
    fn junction_is_left_out() {
        let t = TempDir::new();
        let target = TempDir::new();
        fs::write(target.0.join("t.md"), "x").unwrap();
        fs::write(t.0.join("a.md"), "x").unwrap();
        let link = t.0.join("link.md");
        let ok = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(&link)
            .arg(&target.0)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if !ok {
            println!("note: could not create junction, skipping");
            return;
        }
        let r = list_markdown_files(t.s()).unwrap();
        assert_eq!(names(&r), vec!["a.md"]);
        // remove the junction itself without touching the target
        let _ = fs::remove_dir(&link);
    }

    #[cfg(windows)]
    #[test]
    fn file_symlink_is_left_out() {
        let t = TempDir::new();
        fs::write(t.0.join("a.md"), "x").unwrap();
        fs::write(t.0.join("real.txt"), "x").unwrap();
        if std::os::windows::fs::symlink_file(t.0.join("real.txt"), t.0.join("sym.md")).is_err() {
            println!("note: could not create file symlink (no privilege), skipping");
            return;
        }
        let r = list_markdown_files(t.s()).unwrap();
        assert_eq!(names(&r), vec!["a.md"]);
    }
}
