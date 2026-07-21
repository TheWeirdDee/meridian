// One-shot compile: contracts/Settlement.sol -> contracts/Settlement.json (abi + bytecode).
const fs = require("node:fs");
const path = require("node:path");
const solc = require("solc");

const SRC_PATH = path.join(__dirname, "Settlement.sol");
const source = fs.readFileSync(SRC_PATH, "utf8");

const input = {
  language: "Solidity",
  sources: { "Settlement.sol": { content: source } },
  settings: {
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  const fatal = output.errors.filter((e) => e.severity === "error");
  for (const e of output.errors) console.error(e.formattedMessage);
  if (fatal.length) process.exit(1);
}

const contract = output.contracts["Settlement.sol"]["Settlement"];
const artifact = {
  abi: contract.abi,
  bytecode: "0x" + contract.evm.bytecode.object,
};

fs.writeFileSync(path.join(__dirname, "Settlement.json"), JSON.stringify(artifact, null, 2));
console.log("Compiled Settlement.sol -> contracts/Settlement.json");
console.log("Bytecode length:", artifact.bytecode.length);
