# eth-contract-classifier

## Description

This project includes functions to interact with Ethereum contracts. It provides functionality to get ERC standards by ABI and bytecode. Support ERC20, ERC721, ERC1155, PROXY(DELEGATECALL).

## Installation

npm install eth-contract-classifier

## Usage

Import the functions from the project and use them in your code:
const { getErcByBytecode, getProxyStatus, getErcByAbi, getSigs, isABI } = require('eth-contract-classifier');

// Use the functions let ercType = getErcByAbi(abi); let ercTypeByBytecode = getErcByBytecode(bytecode);

## Functions

### `getSigs(abi)`
This function retrieves the function and event signatures from the given ABI. It takes an ABI (Application Binary Interface) of the contract as an argument and returns an array containing the function and event signatures.

### `isABI(abi, bytecode)`
This function checks if the given ABI is compatible with the provided bytecode. It takes an ABI (Application Binary Interface) and the bytecode of the contract as arguments. It returns true if the ABI is compatible with the bytecode, otherwise returns false.

### `getErcByAbi(abi)`
This function takes an ABI and an object containing various ABIs for different ERC standards. It calculates the percentage of matches for each ERC standard, sorts them, and returns the ERC standard with the highest percentage of matches.

### `getErcByBytecode(bytecode)`
This function works similarly to getErcByAbi, but it takes bytecode instead of an ABI. It uses the web3.js library to encode the ABI functions into bytecode and checks if the input bytecode includes the function bytecode.

### `getProxyStatus(bytecode)`
This function returns prox status. It takes bytecode of the proxy contract.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.
