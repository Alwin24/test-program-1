import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  createBN254,
  createRpc,
  deriveAddress,
  deriveAddressSeed,
  Rpc,
  toAccountMetas,
} from "@lightprotocol/stateless.js";
import { PublicKey } from "@solana/web3.js";
import { TestProgram1 } from "../target/types/test_program_1";
import {
  createNewAddressOutputState,
  getNewAddressParams,
  getValidityProof,
  packNew,
  requiredStaticAccounts,
  sendTransaction,
} from "./utils";

describe("test-program-1", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.TestProgram1 as Program<TestProgram1>;

  const rpc: Rpc = createRpc(program.provider.connection);

  const COUNTER_SEED = "counter";
  const counterSeed = deriveAddressSeed(
    [Buffer.from(COUNTER_SEED), program.provider.publicKey.toBuffer()],
    program.programId
  );
  const counterAddress = deriveAddress(counterSeed);

  it.skip("Create", async () => {
    const newUniqueAddresses: PublicKey[] = [];
    newUniqueAddresses.push(counterAddress);
    console.log(newUniqueAddresses);

    const proof = await getValidityProof(rpc, undefined, newUniqueAddresses);

    const newAddressParams = getNewAddressParams(counterSeed, proof);

    const outputCompressedAccounts = [
      ...createNewAddressOutputState(counterAddress, program.programId),
    ];

    const {
      addressMerkleContext,
      addressMerkleTreeRootIndex,
      merkleContext,
      remainingAccounts,
    } = packNew(outputCompressedAccounts, [newAddressParams], proof);

    const merkleTreeRootIndex = 0;

    const ix = await program.methods
      .create(
        [],
        proof.compressedProof,
        merkleContext,
        merkleTreeRootIndex,
        addressMerkleContext,
        addressMerkleTreeRootIndex
      )
      .accounts({
        signer: program.provider.publicKey,
        ...requiredStaticAccounts(program.programId),
      })
      .remainingAccounts(toAccountMetas(remainingAccounts))
      .instruction();

    await sendTransaction(program, anchor.AnchorProvider.env(), ix);
  });

  it("Verify", async () => {
    const accountInfo = await rpc.getCompressedAccount(
      createBN254(counterAddress.toBase58(), "base58")
    );

    const data = program.coder.types.decode(
      "CounterCompressedAccount",
      accountInfo.data.data
    );
    console.log(data);
  });
});
