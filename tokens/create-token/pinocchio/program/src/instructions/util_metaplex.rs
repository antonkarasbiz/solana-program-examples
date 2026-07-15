//! Helpers for the Metaplex Token Metadata program.
//!
//! Kept separate from the instruction handler so `create_token.rs` stays focused
//! on the account/CPI flow rather than Metaplex wire-format details.

use pinocchio::error::ProgramError;

use crate::instructions::util::{write_borsh_string, write_bytes};

/// The Metaplex Token Metadata program ID
/// (`metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s`).
pub const TOKEN_METADATA_PROGRAM_ID: pinocchio::Address =
    pinocchio::Address::from_str_const("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

/// Discriminator of the Metaplex `CreateMetadataAccountV3` instruction (variant
/// 33 of the Token Metadata program's instruction enum).
const CREATE_METADATA_ACCOUNT_V3: u8 = 33;

/// Upper bound on the serialized `CreateMetadataAccountV3` data, using the
/// Metaplex field maxima (name ≤ 32, symbol ≤ 10, uri ≤ 200). Sizing a fixed
/// stack buffer keeps the program `alloc`-free.
pub const METADATA_DATA_MAX: usize = 1  // discriminator
    + 4 + 32                            // name
    + 4 + 10                            // symbol
    + 4 + 200                           // uri
    + 2                                 // seller_fee_basis_points
    + 3                                 // creators / collection / uses (all None)
    + 1                                 // is_mutable
    + 1; // collection_details (None)

/// Serializes the data for a Metaplex `CreateMetadataAccountV3` instruction into
/// `buffer`, returning the number of bytes written.
///
/// Layout: `[33] DataV2 is_mutable:bool collection_details:Option`, where
/// `DataV2` is `name:string symbol:string uri:string seller_fee:u16
/// creators:Option collection:Option uses:Option`. Mirrors the values used by
/// the `anchor` and `native` examples (no royalties, no creators, immutable).
pub fn build_create_metadata_v3_data(
    buffer: &mut [u8],
    name: &[u8],
    symbol: &[u8],
    uri: &[u8],
) -> Result<usize, ProgramError> {
    let mut offset = 0;
    write_bytes(buffer, &mut offset, &[CREATE_METADATA_ACCOUNT_V3])?;

    // DataV2
    write_borsh_string(buffer, &mut offset, name)?;
    write_borsh_string(buffer, &mut offset, symbol)?;
    write_borsh_string(buffer, &mut offset, uri)?;
    write_bytes(buffer, &mut offset, &0u16.to_le_bytes())?; // seller_fee_basis_points
    write_bytes(buffer, &mut offset, &[0, 0, 0])?; // creators / collection / uses: None

    write_bytes(buffer, &mut offset, &[0])?; // is_mutable: false
    write_bytes(buffer, &mut offset, &[0])?; // collection_details: None

    Ok(offset)
}
