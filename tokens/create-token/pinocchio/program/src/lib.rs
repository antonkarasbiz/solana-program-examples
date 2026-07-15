#![no_std]

pub mod instructions;
pub mod processor;

use pinocchio::{no_allocator, nostd_panic_handler, program_entrypoint};

program_entrypoint!(processor::process_instruction);
// The program builds its instruction data in fixed stack buffers, so no heap
// allocator is needed. `entrypoint!`'s default bump allocator pulls in codegen
// the bankrun test runtime rejects ("unsupported BPF instruction").
no_allocator!();
nostd_panic_handler!();
