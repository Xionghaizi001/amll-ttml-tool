//! Official sample WASM plugin for the AMLL TTML Tool plugin host.
//!
//! Demonstrates the v0 guest calling convention:
//! - lifecycle exports (`plugin_activate` / `plugin_deactivate`)
//! - the synchronous `amll_host_call` bridge (document read, single-transaction
//!   edit, notification, isolated KV storage)
//! - the `showForm` command outcome + `plugin_resume_form` continuation,
//!   because synchronous WASM cannot block on user input.

use extism_pdk::*;
use serde_json::{json, Value};

#[host_fn]
extern "ExtismHost" {
    fn amll_host_call(input: String) -> String;
}

static mut CALL_SEQUENCE: u64 = 0;

fn host_call(method: &str, params: Value) -> Result<Value, Error> {
    let id = unsafe {
        CALL_SEQUENCE += 1;
        CALL_SEQUENCE
    };
    let request = json!({
        "id": format!("c{id}"),
        "method": method,
        "params": params,
    });
    let raw = unsafe { amll_host_call(request.to_string())? };
    let response: Value = serde_json::from_str(&raw)?;
    let result = &response["result"];
    if result["ok"].as_bool() == Some(true) {
        Ok(result["value"].clone())
    } else {
        Err(Error::msg(format!(
            "host call {method} failed: {}",
            result["error"]["message"].as_str().unwrap_or("unknown error")
        )))
    }
}

fn plugin_return(value: Value) -> String {
    json!({ "ok": true, "value": value }).to_string()
}

fn done(value: Value) -> String {
    plugin_return(json!({ "kind": "done", "value": value }))
}

#[plugin_fn]
pub fn plugin_activate(_input: String) -> FnResult<String> {
    Ok(plugin_return(Value::Null))
}

#[plugin_fn]
pub fn plugin_deactivate(_input: String) -> FnResult<String> {
    Ok(plugin_return(Value::Null))
}

#[plugin_fn]
pub fn plugin_handle_event(_input: String) -> FnResult<String> {
    Ok(plugin_return(Value::Null))
}

fn empty_vec() -> Vec<Value> {
    Vec::new()
}

/// Trims leading/trailing whitespace from every word. All patches are queued
/// through one applyEdit call, so the host records exactly one undo entry.
fn trim_words() -> Result<String, Error> {
    let document = host_call("lyrics.getDocument", json!({}))?;
    let revision = document["revision"].as_i64().unwrap_or(0);
    let mut ops: Vec<Value> = Vec::new();
    let lines = document["lines"].as_array().cloned().unwrap_or_else(empty_vec);
    for line in &lines {
        let words = line["words"].as_array().cloned().unwrap_or_else(empty_vec);
        for word in &words {
            let text = word["text"].as_str().unwrap_or("");
            let trimmed = text.trim();
            if trimmed != text {
                ops.push(json!({
                    "op": "updateWord",
                    "wordId": word["id"],
                    "patch": { "text": trimmed },
                }));
            }
        }
    }
    let changed = ops.len();
    if changed > 0 {
        host_call(
            "lyrics.applyEdit",
            json!({
                "expectedRevision": revision,
                "label": "Trim word whitespace",
                "ops": ops,
            }),
        )?;
    }
    host_call(
        "storage.set",
        json!({ "key": "lastTrimCount", "value": changed }),
    )?;
    host_call(
        "ui.notify",
        json!({
            "level": if changed > 0 { "success" } else { "info" },
            "message": format!("Trimmed {changed} word(s)"),
        }),
    )?;
    Ok(done(json!({ "trimmed": changed })))
}

fn word_count_form() -> String {
    plugin_return(json!({
        "kind": "showForm",
        "state": { "step": "count" },
        "schema": {
            "title": { "default": "Count words", "zh-CN": "统计字词" },
            "size": "small",
            "fields": [
                {
                    "kind": "radio",
                    "key": "scope",
                    "label": { "default": "Scope", "zh-CN": "统计范围" },
                    "default": "all",
                    "options": [
                        { "value": "all", "label": { "default": "All lines", "zh-CN": "全部行" } },
                        { "value": "selected", "label": { "default": "Selected lines", "zh-CN": "所选行" } }
                    ]
                }
            ],
            "submitLabel": { "default": "Count", "zh-CN": "统计" },
            "cancelLabel": { "default": "Cancel", "zh-CN": "取消" }
        }
    }))
}

fn count_words(scope: &str) -> Result<String, Error> {
    let document = host_call("lyrics.getDocument", json!({}))?;
    let selected: Vec<String> = if scope == "selected" {
        let selection = host_call("lyrics.getSelection", json!({}))?;
        selection["lineIds"]
            .as_array()
            .cloned()
            .unwrap_or_else(empty_vec)
            .iter()
            .filter_map(|value| value.as_str().map(str::to_owned))
            .collect()
    } else {
        Vec::new()
    };
    let mut line_count = 0usize;
    let mut word_count = 0usize;
    let mut char_count = 0usize;
    let lines = document["lines"].as_array().cloned().unwrap_or_else(empty_vec);
    for line in &lines {
        let id = line["id"].as_str().unwrap_or("");
        if scope == "selected" && !selected.iter().any(|candidate| candidate == id) {
            continue;
        }
        line_count += 1;
        let words = line["words"].as_array().cloned().unwrap_or_else(empty_vec);
        for word in &words {
            let text = word["text"].as_str().unwrap_or("");
            if !text.trim().is_empty() {
                word_count += 1;
            }
            char_count += text.chars().count();
        }
    }
    host_call(
        "storage.set",
        json!({
            "key": "lastCount",
            "value": { "lines": line_count, "words": word_count, "chars": char_count },
        }),
    )?;
    host_call(
        "ui.notify",
        json!({
            "level": "info",
            "message": format!("{line_count} line(s), {word_count} word(s), {char_count} character(s)"),
        }),
    )?;
    Ok(done(json!({
        "lines": line_count,
        "words": word_count,
        "chars": char_count,
    })))
}

#[plugin_fn]
pub fn plugin_execute_command(input: String) -> FnResult<String> {
    let params: Value = serde_json::from_str(&input)?;
    let command = params["commandId"].as_str().unwrap_or("");
    match command {
        "example.sample-tools.trimWords" => Ok(trim_words()?),
        "example.sample-tools.wordCount" => Ok(word_count_form()),
        _ => Ok(json!({
            "ok": false,
            "error": { "code": "not-found", "message": format!("unknown command {command}") },
        })
        .to_string()),
    }
}

#[plugin_fn]
pub fn plugin_resume_form(input: String) -> FnResult<String> {
    let params: Value = serde_json::from_str(&input)?;
    let command = params["commandId"].as_str().unwrap_or("");
    if command != "example.sample-tools.wordCount" {
        return Ok(json!({
            "ok": false,
            "error": { "code": "not-found", "message": format!("unknown command {command}") },
        })
        .to_string());
    }
    let result = &params["result"];
    if result["submitted"].as_bool() != Some(true) {
        return Ok(done(Value::Null));
    }
    let scope = result["values"]["scope"].as_str().unwrap_or("all");
    Ok(count_words(scope)?)
}
