use std::collections::HashMap;
use std::thread;
use std::sync::{Arc, Mutex, mpsc};
use std::time::Duration;
use tiny_http::{Header, Method, Response, Server};
use tauri::{AppHandle, Emitter};

#[derive(Clone, Default)]
pub struct PendingRaycastRequests(
    pub Arc<Mutex<HashMap<String, mpsc::Sender<String>>>>,
);

pub struct RaycastManager {
    pub pending_requests: PendingRaycastRequests,
}

impl RaycastManager {
    pub fn new() -> Self {
        Self {
            pending_requests: PendingRaycastRequests::default(),
        }
    }

    pub fn start_raycast_api(&self, app_handle: tauri::AppHandle) -> Result<(), String> {
        let pending = self.pending_requests.clone();
        thread::spawn(move || {
            let server = match Server::http("0.0.0.0:18420") {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("Konnte API-Server nicht starten: {}", e);
                    return;
                }
            };

            for mut request in server.incoming_requests() {
                let url = request.url().to_string();
                let method = request.method();

                let h_origin = Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap();
                let h_methods = Header::from_bytes(&b"Access-Control-Allow-Methods"[..], &b"POST, GET, OPTIONS"[..]).unwrap();
                let h_headers = Header::from_bytes(&b"Access-Control-Allow-Headers"[..], &b"*"[..]).unwrap();
                let h_json = Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap();

                if *method == Method::Options {
                    let res = Response::from_string("")
                        .with_header(h_origin)
                        .with_header(h_methods)
                        .with_header(h_headers);
                    let _ = request.respond(res);
                    continue;
                }

                match (method, url.as_str()) {
                    (&Method::Get, u) if u.starts_with("/api/recommendations") => {
                        let json_res = await_react_response(
                            &app_handle,
                            &pending,
                            "recommendations",
                            serde_json::json!({}),
                        );
                        let res = Response::from_string(json_res)
                            .with_header(h_origin.clone())
                            .with_header(h_json.clone());
                        let _ = request.respond(res);
                    }

                    (&Method::Get, u) if u.starts_with("/api/search") => {
                        let query = u.split("q=").nth(1).unwrap_or("").split('&').next().unwrap_or("");
                        let decoded_query = urlencoding::decode(query).unwrap_or_default().to_string();

                        let json_res = await_react_response(
                            &app_handle,
                            &pending,
                            "search",
                            serde_json::json!({ "query": decoded_query }),
                        );
                        let res = Response::from_string(json_res)
                            .with_header(h_origin.clone())
                            .with_header(h_json.clone());
                        let _ = request.respond(res);
                    }

                    (&Method::Post, "/api/play-track") => {
                        let mut body = String::new();
                        let _ = request.as_reader().read_to_string(&mut body);
                        let body_json: serde_json::Value = serde_json::from_str(&body).unwrap_or_default();

                        let json_res = await_react_response(
                            &app_handle,
                            &pending,
                            "playTrack",
                            body_json,
                        );
                        let res = Response::from_string(json_res)
                            .with_header(h_origin.clone())
                            .with_header(h_json.clone());
                        let _ = request.respond(res);
                    }

                    (&Method::Get, "/api/playlist") => {
                        let mut body = String::new();
                        let _ = request.as_reader().read_to_string(&mut body);
                        let body_json: serde_json::Value = serde_json::from_str(&body).unwrap_or_default();

                        let json_res = await_react_response(
                            &app_handle,
                            &pending,
                            "getPlaylist",
                            body_json,
                        );
                        let res = Response::from_string(json_res)
                            .with_header(h_origin.clone())
                            .with_header(h_json.clone());
                        let _ = request.respond(res);
                    }
                    (&Method::Post, "/api/playlist/reorder") => {
                        let mut body = String::new();
                        let _ = request.as_reader().read_to_string(&mut body);
                        let body_json: serde_json::Value = serde_json::from_str(&body).unwrap_or_default();
                        println!("Received reorderPlaylist request with body: {}", body_json);
                        let json_res = await_react_response(
                            &app_handle,
                            &pending,
                            "reorderPlaylist",
                            body_json,
                        );
                        let res = Response::from_string(json_res)
                            .with_header(h_origin.clone())
                            .with_header(h_json.clone());
                        let _ = request.respond(res);
                    }


                    (&Method::Post, "/api/play-playlist") => {
                        let mut body = String::new();
                        let _ = request.as_reader().read_to_string(&mut body);
                        let body_json: serde_json::Value = serde_json::from_str(&body).unwrap_or_default();

                        let json_res = await_react_response(
                            &app_handle,
                            &pending,
                            "playPlaylist",
                            body_json,
                        );
                        let res = Response::from_string(json_res)
                            .with_header(h_origin.clone())
                            .with_header(h_json.clone());
                        let _ = request.respond(res);
                    }

                    (&Method::Post, "/api/pause-resume") => {
                        let _ = app_handle.emit("raycast-command", "playPause");
                        let res = Response::from_string(r#"{"status":"ok"}"#)
                            .with_header(h_origin.clone())
                            .with_header(h_json.clone());
                        let _ = request.respond(res);
                    }
                    (&Method::Post, "/api/next") => {
                        let _ = app_handle.emit("raycast-command", "next");
                        let res = Response::from_string(r#"{"status":"ok"}"#)
                            .with_header(h_origin.clone())
                            .with_header(h_json.clone());
                        let _ = request.respond(res);
                    }
                    (&Method::Post, "/api/previous") => {
                        let _ = app_handle.emit("raycast-command", "previous");
                        let res = Response::from_string(r#"{"status":"ok"}"#)
                            .with_header(h_origin.clone())
                            .with_header(h_json.clone());
                        let _ = request.respond(res);
                    }
                    _ => {
                        let res = Response::from_string("Not Found").with_status_code(404);
                        let _ = request.respond(res);
                    }
                }
            }
        });
        Ok(())
    }
}

 fn await_react_response(
        app_handle: &AppHandle,
        pending: &PendingRaycastRequests,
        command: &str,
        data: serde_json::Value,
    ) -> String {
        let request_id = format!("{:?}", std::time::Instant::now());
        let (tx, rx) = mpsc::channel();

        if let Ok(mut map) = pending.0.lock() {
            map.insert(request_id.clone(), tx);
        }

        // Event an React senden
        let _ = app_handle.emit("raycast-request", serde_json::json!({
            "requestId": request_id,
            "command": command,
            "data": data
        }));

        // Maximal 4 Sekunden auf Antwort aus React warten
        match rx.recv_timeout(Duration::from_secs(4)) {
            Ok(json_payload) => json_payload,
            Err(_) => {
                if let Ok(mut map) = pending.0.lock() {
                    map.remove(&request_id);
                }
                r#"[]"#.to_string() // Fallback-JSON bei Timeout
            }
        }
    }

#[tauri::command]
pub fn respond_raycast_request(
    pending: tauri::State<'_, PendingRaycastRequests>,
    request_id: String,
    payload: String,
) {
    if let Ok(mut map) = pending.0.lock() {
        if let Some(tx) = map.remove(&request_id) {
            let _ = tx.send(payload);
        }
    }
}