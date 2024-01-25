# Project Name

## Description

This project includes functions to interact with Ethereum contracts. It provides functionality to get ERC standards by ABI and bytecode. Support ERC20, ERC721, ERC1155, PROXY(DELEGATECALL).

## Installation

npm install eth-contract-classifier

## Usage

Import the functions from the project and use them in your code:
const { getErcByBytecode, getProxyAddress, getErcByAbi, getSigs, isABI } = require('eth-contract-classifier');

// Use the functions let ercType = getErcByAbi(abi); let ercTypeByBytecode = getErcByBytecode(bytecode);

## Functions

### `getSigs(abi)`
This function retrieves the function and event signatures from the given ABI. It takes an ABI (Application Binary Interface) of the contract as an argument and returns an array containing the function and event signatures.

### `isABI(abi, bytecode)`
This function checks if the given ABI is compatible with the provided bytecode. It takes an ABI (Application Binary Interface) and the bytecode of the contract as arguments. It returns true if the ABI is compatible with the bytecode, otherwise returns false.

### `getErcByAbi(abi, percent)`
This function determines the ERC type of a contract based on its ABI. It takes the ABI (Application Binary Interface) of the contract and a percent value as arguments. The percent value represents the percentage of the ABI to be analyzed. The function returns the ERC type.

### `getErcByBytecode(bytecode, percent)`
This function determines the ERC type of a contract based on its bytecode. It takes the bytecode of the contract and a percent value as arguments. The percent value represents the percentage of bytecode to be analyzed. The function returns the ERC type.

### `getProxyAddress(bytecode)`
This function retrieves the address of the proxy contract for a given contract. It takes bytecode of the proxy contract.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.