#![no_std]

use core::panic::PanicInfo;

#[link(wasm_import_module = "extism:host/env")]
extern "C" {
    fn input_length() -> i64;
    fn input_load_u8(offset: i64) -> i32;
    fn alloc(length: i64) -> i64;
    fn store_u8(offset: i64, value: i32);
    fn output_set(offset: i64, length: i64);
}

#[no_mangle]
pub extern "C" fn echo_json() {
    let length = unsafe { input_length() };
    let output = unsafe { alloc(length) };
    unsafe {
        let mut index = 0;
        while index < length {
            store_u8(output + index, input_load_u8(index));
            index += 1;
        }
        output_set(output, length);
    }
}

#[no_mangle]
pub extern "C" fn hang() {
    loop {
        core::hint::spin_loop();
    }
}

#[no_mangle]
pub extern "C" fn crash() {
    core::arch::wasm32::unreachable();
}

#[panic_handler]
fn panic(_panic: &PanicInfo) -> ! {
    core::arch::wasm32::unreachable();
}
