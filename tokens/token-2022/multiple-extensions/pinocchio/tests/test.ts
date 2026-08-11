import * as path from 'node:path';
import {
    AccountRole,
    type Address,
    appendTransactionMessageInstruction,
    createTransactionMessage,
    generateKeyPairSigner,
    getStructEncoder,
    getU8Encoder,
    lamports,
    pipe,
    setTransactionMessageFeePayerSigner,
    signTransactionMessageWithSigners,
    unwrapOption,
} from '@solana/kit';
import { SYSVAR_RENT_ADDRESS } from '@solana/sysvars';
import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import { getMintDecoder, TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import { assert } from 'chai';
import { FailedTransactionMetadata, LiteSVM } from 'litesvm';

// Instruction data layout, matching the program's `CreateTokenArgs`.
const createTokenArgsEncoder = getStructEncoder([['tokenDecimals', getU8Encoder()]]);

// Token-2022 lays a mint carrying these two extensions out as:
//   base account length (165) + account-type byte (1)
//   + MintCloseAuthority TLV (2 + 2 + 32) + NonTransferable TLV (2 + 2 + 0) = 206
const EXTENDED_MINT_SIZE = 206;

// The compiled program artifact, produced by `build-and-test` into ./fixtures.
// The npm scripts always run from the package root, so resolve from the cwd.
const PROGRAM_SO = path.join(process.cwd(), 'tests', 'fixtures', 'token_2022_multiple_extensions_pinocchio_program.so');

describe('Token-2022 Multiple Extensions (Pinocchio)', () => {
    let svm: LiteSVM;
    let programId: Address;

    before(async () => {
        svm = new LiteSVM();
        // The program never asserts its own id, so any address works; a generated
        // one keeps the test self-contained.
        programId = (await generateKeyPairSigner()).address;
        svm.addProgramFromFile(programId, PROGRAM_SO);
    });

    it('Creates a Token-2022 mint with both close-authority and non-transferable extensions', async () => {
        const decimals = 9;
        const payer = await generateKeyPairSigner();
        svm.airdrop(payer.address, lamports(1_000_000_000n));

        const mint = await generateKeyPairSigner();

        const data = createTokenArgsEncoder.encode({ tokenDecimals: decimals });

        const ix = {
            programAddress: programId,
            accounts: [
                { address: mint.address, role: AccountRole.WRITABLE_SIGNER, signer: mint }, // mint account
                // The mint authority doubles as the freeze authority, and the close
                // authority is set to the same key, so a single payer covers all roles.
                { address: payer.address, role: AccountRole.READONLY }, // mint authority
                { address: payer.address, role: AccountRole.READONLY }, // close authority
                { address: payer.address, role: AccountRole.WRITABLE_SIGNER, signer: payer }, // payer
                { address: SYSVAR_RENT_ADDRESS, role: AccountRole.READONLY }, // rent sysvar
                { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY }, // system program
                { address: TOKEN_2022_PROGRAM_ADDRESS, role: AccountRole.READONLY }, // Token-2022 program
            ],
            data,
        };

        const transactionMessage = pipe(
            createTransactionMessage({ version: 0 }),
            m => setTransactionMessageFeePayerSigner(payer, m),
            m => svm.setTransactionMessageLifetimeUsingLatestBlockhash(m),
            m => appendTransactionMessageInstruction(ix, m),
        );

        const signedTx = await signTransactionMessageWithSigners(transactionMessage);
        const result = svm.sendTransaction(signedTx);
        if (result instanceof FailedTransactionMetadata) {
            throw new Error(`Transaction failed: ${result.err()}`);
        }

        const mintAccount = svm.getAccount(mint.address);
        if (!mintAccount?.exists) throw new Error('Mint account not found');

        // Owned by Token-2022, and sized for exactly the two extensions.
        assert.equal(mintAccount.programAddress, TOKEN_2022_PROGRAM_ADDRESS);
        assert.equal(mintAccount.data.length, EXTENDED_MINT_SIZE);

        // Decode the base mint fields and its TLV extensions with the official
        // Token-2022 codec instead of reading raw byte offsets by hand.
        const mintState = getMintDecoder().decode(mintAccount.data);
        assert.equal(mintState.decimals, decimals);

        const extensions = unwrapOption(mintState.extensions) ?? [];

        // MintCloseAuthority is present and points at the configured authority.
        const closeAuthorityExtension = extensions.find(e => e.__kind === 'MintCloseAuthority');
        if (closeAuthorityExtension?.__kind !== 'MintCloseAuthority') {
            throw new Error('MintCloseAuthority extension not found on the mint');
        }
        assert.equal(closeAuthorityExtension.closeAuthority, payer.address);

        // NonTransferable is present (it carries no configuration).
        const nonTransferableExtension = extensions.find(e => e.__kind === 'NonTransferable');
        if (nonTransferableExtension?.__kind !== 'NonTransferable') {
            throw new Error('NonTransferable extension not found on the mint');
        }

        console.log('Mint address:', mint.address);
    });
});
