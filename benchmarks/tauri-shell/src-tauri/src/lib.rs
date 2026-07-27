use serde::Serialize;
use std::{thread, time::Duration};
use tauri::{AppHandle, Emitter, Manager};

/// One streamed line. Kept small and fixed-shape so IPC serialization costs the
/// same for every target and the measured difference stays in the frontend.
#[derive(Serialize, Clone)]
struct Tick {
    seq: u32,
    text: String,
    done: bool,
}

/// Emit `count` events as fast as the IPC bridge accepts them. This is the
/// desktop workload the benchmark exists for: a log tail or progress stream
/// pushed from Rust into a webview list.
#[tauri::command]
fn bench_stream(app: AppHandle, count: u32) {
    thread::spawn(move || {
        for seq in 1..=count {
            let tick = Tick {
                seq,
                text: format!("worker {} committed batch {}", seq % 7, seq),
                done: seq == count,
            };
            if app.emit("bench:tick", tick).is_err() {
                return;
            }
        }
    });
}

/// Receive the page's measurements, print them for the runner, and end the
/// process so the runner can move on to the next target.
#[tauri::command]
fn bench_report(app: AppHandle, payload: String) {
    println!("BENCH_RESULT {payload}");
    // Give stdout a moment to flush through the pipe before the loop tears down.
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(50));
        app.exit(0);
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                // An unfocused or occluded WKWebView throttles timers and paints,
                // which would silently distort every measurement below.
                let _ = window.set_focus();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![bench_stream, bench_report])
        .run(tauri::generate_context!())
        .expect("error while running the benchmark host");
}
