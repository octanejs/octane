use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::{thread, time::Duration};
use tauri::{AppHandle, Emitter};

/// Kept in step with `src/bridge.ts` so the browser preview and the desktop
/// build stream at the same pace.
const LINE_INTERVAL_MS: u64 = 150;

/// Bumped per run so a superseded thread stops emitting, matching the browser
/// bridge, where starting a run clears the previous run's pending timers.
static RUN_GENERATION: AtomicU64 = AtomicU64::new(0);

#[derive(Serialize, Clone)]
struct Task {
    id: &'static str,
    name: &'static str,
    summary: &'static str,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TaskDetail {
    id: &'static str,
    command: &'static str,
    working_directory: &'static str,
    last_run: &'static str,
    average_ms: u32,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LogLine {
    task_id: String,
    seq: u32,
    text: &'static str,
    done: bool,
}

const TASKS: [Task; 3] = [
    Task {
        id: "typecheck",
        name: "Typecheck",
        summary: "Project-wide TypeScript pass",
    },
    Task {
        id: "bundle",
        name: "Bundle",
        summary: "Production client build",
    },
    Task {
        id: "migrate",
        name: "Migrate",
        summary: "Apply pending schema migrations",
    },
];

const DETAILS: [TaskDetail; 3] = [
    TaskDetail {
        id: "typecheck",
        command: "tsrx-tsc --noEmit",
        working_directory: "~/projects/workbench",
        last_run: "2026-07-27 09:14",
        average_ms: 8400,
    },
    TaskDetail {
        id: "bundle",
        command: "vite build --mode production",
        working_directory: "~/projects/workbench",
        last_run: "2026-07-27 09:02",
        average_ms: 15200,
    },
    TaskDetail {
        id: "migrate",
        command: "workbench migrate --yes",
        working_directory: "~/projects/workbench/db",
        last_run: "2026-07-26 18:41",
        average_ms: 2600,
    },
];

fn log_script(id: &str) -> Option<&'static [&'static str]> {
    match id {
        "typecheck" => Some(&[
            "resolving project references",
            "loading tsconfig.json",
            "checking 412 files",
            "checking 812 files",
            "checking 1204 files",
            "checking 1611 files",
            "no diagnostics reported",
            "typecheck finished",
        ]),
        "bundle" => Some(&[
            "clearing dist/",
            "compiling 96 modules",
            "compiling 214 modules",
            "compiling 388 modules",
            "inlining assets",
            "minifying chunks",
            "writing dist/client",
            "bundle finished",
        ]),
        "migrate" => Some(&[
            "connecting to local database",
            "reading migration ledger",
            "applying 2026_07_14_projects",
            "applying 2026_07_21_runs",
            "applying 2026_07_24_artifacts",
            "verifying constraints",
            "writing schema snapshot",
            "migrate finished",
        ]),
        _ => None,
    }
}

#[tauri::command]
fn list_tasks() -> Vec<Task> {
    TASKS.to_vec()
}

#[tauri::command]
fn describe_task(id: String) -> Result<TaskDetail, String> {
    DETAILS
        .iter()
        .find(|detail| detail.id == id)
        .cloned()
        .ok_or_else(|| format!("no manifest for task {id}"))
}

#[tauri::command]
fn run_task(app: AppHandle, id: String) -> Result<(), String> {
    let lines = log_script(&id).ok_or_else(|| format!("no run script for task {id}"))?;
    let generation = RUN_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    thread::spawn(move || {
        for (index, text) in lines.iter().enumerate() {
            thread::sleep(Duration::from_millis(LINE_INTERVAL_MS));
            if RUN_GENERATION.load(Ordering::SeqCst) != generation {
                return;
            }
            let line = LogLine {
                task_id: id.clone(),
                seq: (index + 1) as u32,
                text,
                done: index + 1 == lines.len(),
            };
            // A closed window drops the emit; the run thread still winds down.
            let _ = app.emit("workbench:log", line);
        }
    });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_tasks,
            describe_task,
            run_task
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Workbench application");
}
