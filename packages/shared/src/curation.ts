/**
 * Curation vault registry: Morpho factory contracts and Yearn curator addresses.
 * Used by fetch-curation.ts to dynamically discover vaults on-chain.
 */

export const YEARN_CURATOR_OWNERS = [
  "0xFc5F89d29CCaa86e5410a7ad9D9d280d4455C12B",
  "0x50B75d586929Ab2F75dC15f07E1B921b7C4Ba8fA",
  "0x75a1253432356f90611546a487b5350CEF08780D",
  "0x518C21DC88D9780c0A1Be566433c571461A70149", // Katana only
] as const;

export interface MorphoFactory {
  address: `0x${string}`;
  fromBlock: bigint;
  version: "v1" | "v2";
}

export interface CurationChainConfig {
  chainId: number;
  name: string;
  factories: MorphoFactory[];
}

export const CURATION_CHAINS: CurationChainConfig[] = [
  {
    chainId: 1,
    name: "Ethereum",
    factories: [
      { address: "0xa9c3d3a366466fa809d1ae982fb2c46e5fc41101", fromBlock: 18925584n, version: "v1" },
      { address: "0x1897a8997241c1cd4bd0698647e4eb7213535c24", fromBlock: 21439510n, version: "v1" },
      { address: "0xA1D94F746dEfa1928926b84fB2596c06926C0405", fromBlock: 23375073n, version: "v2" },
    ],
  },
  {
    chainId: 8453,
    name: "Base",
    factories: [
      { address: "0xA9c3D3a366466Fa809d1Ae982Fb2c46E5fC41101", fromBlock: 13978134n, version: "v1" },
      { address: "0xFf62A7c278C62eD665133147129245053Bbf5918", fromBlock: 23928808n, version: "v1" },
      { address: "0x4501125508079A99ebBebCE205DeC9593C2b5857", fromBlock: 35615206n, version: "v2" },
    ],
  },
  {
    chainId: 747474,
    name: "Katana",
    factories: [{ address: "0x1c8De6889acee12257899BFeAa2b7e534de32E16", fromBlock: 2741420n, version: "v1" }],
  },
  {
    chainId: 42161,
    name: "Arbitrum",
    factories: [
      { address: "0x878988f5f561081deEa117717052164ea1Ef0c82", fromBlock: 296447195n, version: "v1" },
      { address: "0x6b46fa3cc9EBF8aB230aBAc664E37F2966Bf7971", fromBlock: 387016724n, version: "v2" },
    ],
  },
  {
    chainId: 999,
    name: "Hyperliquid",
    factories: [{ address: "0xec051b19d654C48c357dC974376DeB6272f24e53", fromBlock: 1988677n, version: "v1" }],
  },
];

/**
 * Extra curation vaults not discoverable via Morpho factories.
 * Includes Turtle Club (Ethereum ERC4626) and other non-Morpho curated vaults.
 * Used as a hardcoded fallback — the Morpho API may also discover these via creatorAddress.
 */
export interface ExtraCurationVault {
  address: `0x${string}`;
  chainId: number;
  label: string;
}

export const EXTRA_CURATION_VAULTS: ExtraCurationVault[] = [
  // Turtle Club (Ethereum)
  { address: "0xF470EB50B4a60c9b069F7Fd6032532B8F5cC014d", chainId: 1, label: "Turtle Club" },
  { address: "0xA5DaB32DbE68E6fa784e1e50e4f620a0477D3896", chainId: 1, label: "Turtle Club" },
  { address: "0xe1Ac97e2616Ad80f69f705ff007A4bbb3655544a", chainId: 1, label: "Turtle Club" },
  { address: "0x77570CfEcf83bc6bB08E2cD9e8537aeA9F97eA2F", chainId: 1, label: "Turtle Club" },
  // ARM WETH (Ethereum) — also found via Morpho API creatorAddress
  { address: "0x3Dfe70B05657949A5dB340754aD664810ac63b21", chainId: 1, label: "ARM WETH" },
  // OUSD (Base) — also found via Morpho API creatorAddress
  { address: "0x581Cc9a73Ec7431723A4a80699B8f801205841F1", chainId: 8453, label: "OUSD" },
];

/** Turtle Club addresses only (Ethereum) — used by cross-chain overlap registry */
export const TURTLE_CLUB_VAULTS: `0x${string}`[] = EXTRA_CURATION_VAULTS.filter((v) => v.chainId === 1 && v.label === "Turtle Club").map(
  (v) => v.address,
);
