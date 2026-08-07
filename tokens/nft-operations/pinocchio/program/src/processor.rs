use pinocchio::{error::ProgramError, AccountView, Address, ProgramResult};
use pinocchio_log::log;

use crate::instructions::{create_collection, mint_nft, verify_collection};

/// Dispatches an instruction based on its leading discriminator byte.
///
/// Instruction data layout: `[discriminator: u8]`
///   - `0` -> CreateCollection  (mints a collection NFT)
///   - `1` -> MintNft           (mints an NFT that belongs to the collection)
///   - `2` -> VerifyCollection  (verifies the NFT as part of the collection)
///
/// The `[b"authority"]` mint-authority PDA and its bump are derived on-chain
/// (as the Anchor example does), so no bump is carried in the instruction data.
pub fn process_instruction(
    program_id: &Address,
    accounts: &mut [AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    let discriminator = *instruction_data.first().ok_or(ProgramError::InvalidInstructionData)?;

    match discriminator {
        0 => {
            log!("Instruction: CreateCollection");
            create_collection(program_id, accounts)
        }
        1 => {
            log!("Instruction: MintNft");
            mint_nft(program_id, accounts)
        }
        2 => {
            log!("Instruction: VerifyCollection");
            verify_collection(program_id, accounts)
        }
        _ => Err(ProgramError::InvalidInstructionData),
    }
}
