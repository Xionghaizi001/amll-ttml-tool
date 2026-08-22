use extism_pdk::*;

#[plugin_fn]
pub fn echo_json(input: String) -> FnResult<String> {
	Ok(input)
}
