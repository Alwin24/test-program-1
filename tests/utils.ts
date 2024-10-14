import { AnchorProvider, Program } from "@coral-xyz/anchor";
import {
  bn,
  CompressedAccount,
  CompressedAccountWithMerkleContext,
  CompressedProofWithContext,
  defaultStaticAccountsStruct,
  defaultTestStateTreeAccounts,
  getIndexOrAdd,
  LightSystemProgram,
  NewAddressParams,
  packCompressedAccounts,
  PackedMerkleContext,
  packNewAddressParams,
  Rpc,
} from "@lightprotocol/stateless.js";
import { keccak_256 } from "@noble/hashes/sha3";
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import { TestProgram1 } from "../target/types/test_program_1";

const { addressTree, addressQueue, merkleTree, nullifierQueue } =
  defaultTestStateTreeAccounts();

export function packNew(
  outputCompressedAccounts: CompressedAccount[],
  newAddressesParams: NewAddressParams[],
  proof: CompressedProofWithContext
) {
  const { remainingAccounts: _remainingAccounts } = packCompressedAccounts(
    [],
    proof.rootIndices,
    outputCompressedAccounts
  );
  const { newAddressParamsPacked, remainingAccounts } = packNewAddressParams(
    newAddressesParams,
    _remainingAccounts
  );
  let {
    addressMerkleTreeAccountIndex,
    addressMerkleTreeRootIndex,
    addressQueueAccountIndex,
  } = newAddressParamsPacked[0];

  let merkleContext: PackedMerkleContext = {
    leafIndex: 0,
    merkleTreePubkeyIndex: getIndexOrAdd(remainingAccounts, merkleTree),
    nullifierQueuePubkeyIndex: getIndexOrAdd(remainingAccounts, nullifierQueue),
    queueIndex: null,
  };
  return {
    addressMerkleContext: {
      addressMerkleTreePubkeyIndex: addressMerkleTreeAccountIndex,
      addressQueuePubkeyIndex: addressQueueAccountIndex,
    },
    addressMerkleTreeRootIndex,
    merkleContext,
    remainingAccounts,
  };
}

export function packWithInput(
  inputCompressedAccounts: CompressedAccountWithMerkleContext[],
  outputCompressedAccounts: CompressedAccount[],
  newAddressesParams: NewAddressParams[],
  proof: CompressedProofWithContext
) {
  const { packedInputCompressedAccounts, remainingAccounts } =
    packCompressedAccounts(
      inputCompressedAccounts,
      proof.rootIndices,
      outputCompressedAccounts
    );

  let { rootIndex, merkleContext } = packedInputCompressedAccounts[0];

  return {
    addressMerkleContext: {
      addressMerkleTreePubkeyIndex: getIndexOrAdd(
        remainingAccounts,
        addressTree
      ),
      addressQueuePubkeyIndex: getIndexOrAdd(remainingAccounts, addressQueue),
    },
    addressMerkleTreeRootIndex: 0,
    merkleContext,
    rootIndex,
    remainingAccounts,
  };
}

export function getNewAddressParams(
  addressSeed: Uint8Array,
  proof: CompressedProofWithContext
) {
  const addressParams: NewAddressParams = {
    seed: addressSeed,
    addressMerkleTreeRootIndex: proof.rootIndices[proof.rootIndices.length - 1],
    addressMerkleTreePubkey: proof.merkleTrees[proof.merkleTrees.length - 1],
    addressQueuePubkey: proof.nullifierQueues[proof.nullifierQueues.length - 1],
  };
  return addressParams;
}

export function createNewAddressOutputState(
  address: PublicKey,
  programId: PublicKey
) {
  return LightSystemProgram.createNewAddressOutputState(
    Array.from(address.toBytes()),
    programId
  );
}

export async function getValidityProof(
  rpc: Rpc,
  inputHashes?: BN[],
  newUniqueAddresses?: PublicKey[]
) {
  const outputHashes = newUniqueAddresses?.map((addr) => bn(addr.toBytes()));
  return await rpc.getValidityProof(inputHashes, outputHashes);
}

function hashvToBn254FieldSizeBe(bytes: Uint8Array[]): Uint8Array {
  const hasher = keccak_256.create();
  for (const input of bytes) {
    hasher.update(input);
  }
  const hash = hasher.digest();
  hash[0] = 0;
  return hash;
}

export function deriveAddressSeed(
  seeds: Uint8Array[],
  programId: PublicKey
): Uint8Array {
  const combinedSeeds: Uint8Array[] = [programId.toBytes(), ...seeds];
  const hash = hashvToBn254FieldSizeBe(combinedSeeds);
  return hash;
}

export function requiredStaticAccounts(programId: PublicKey) {
  const [cpiSigner] = PublicKey.findProgramAddressSync(
    [Buffer.from("cpi_authority")],
    programId
  );

  return {
    selfProgram: programId,
    cpiSigner,
    lightSystemProgram: LightSystemProgram.programId,
    systemProgram: SystemProgram.programId,
    ...defaultStaticAccountsStruct(),
  };
}

const logTxnSignature = (tx: string) => {
  console.log(
    "Your transaction signature",
    `https://explorer.solana.com/tx/${tx}?cluster=custom`
  );
};

const priorityFeeIxs = () => {
  const ixs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 500000 }),
  ];

  return ixs;
};

export async function sendTransaction(
  program: Program<TestProgram1>,
  provider: AnchorProvider,
  ix: TransactionInstruction
) {
  let tx = new Transaction().add(...priorityFeeIxs(), ix);

  const blockhashWithContext =
    await program.provider.connection.getLatestBlockhash();
  tx.recentBlockhash = blockhashWithContext.blockhash;
  tx.feePayer = program.provider.publicKey;

  tx = await provider.wallet.signTransaction(tx);

  const signature = await program.provider.connection.sendRawTransaction(
    tx.serialize()
  );

  logTxnSignature(signature);
}
