const web3 = require('web3');
const { EVM } = require("evm");
const abis = {
    erc20: require('./abis/erc20.json'),
    erc721: require('./abis/erc721.json'),
    erc1155: require('./abis/erc1155.json')
}

/**
 * Retrieves the function and event signatures from the given ABI.
 * @param {Array} abi - The ABI (Application Binary Interface) of the contract.
 * @returns {Array} - An array containing the function and event signatures.
 */
function getSigs(abi) {
    const abiFunctions = abi.filter(item => item.type === 'function')
    .map(item => web3.eth.abi.encodeFunctionSignature(item).replace("0x",""));
    const abiEvents = abi.filter(item => item.type === 'event')
    .map(item => web3.eth.abi.encodeEventSignature(item).replace("0x",""));
    return abiFunctions.concat(abiEvents);
}


/**
 * Checks if the given ABI is compatible with the provided bytecode.
 * @param {Array} abi - The ABI (Application Binary Interface) of the contract.
 * @param {string} bytecode - The bytecode of the contract.
 * @returns {boolean} - Returns true if the ABI is compatible with the bytecode, otherwise returns false.
 */
function isABI(abi, bytecode) {
    return getSigs(abi).every(item => bytecode.includes(item));
}

/**
 * Retrieves the status address from the given bytecode.
 * @param {string} bytecode - The bytecode of the contract.
 * @returns {string|undefined} - The proxy address if found, otherwise undefined.
 */
function getProxyStatus(bytecode) {        
    const evm = new EVM(bytecode);
    const opcodes = evm.getOpcodes();
    let result;
    if (opcodes.find(item => item.name === 'DELEGATECALL')) {
        const push20 = opcodes.find(item => item.name === 'PUSH20');
        if (push20){
            result = `DELEGATECALL to 0x${push20.pushData.toString('hex')}`;
        }else if(isABI([{"inputs":[],"name":"implementation",
        "outputs":[{"internalType":"address","name":"","type":"address"}],
        "stateMutability":"view","type":"function"}], bytecode)){
            result = "IMPLEMENTATION";
        }else{
            result = "DELEGATECALL";
        }
    }
    return result;
}

/**
 * Returns the ERC token with the highest percentage match to the given ABI.
 * @param {object} abi - The ABI object to compare against.
 * @param {number} [percent=100] - The minimum percentage match required.
 * @returns {string|undefined} - The key of the ERC token with the highest match percentage, or undefined if no match is found.
 */
function getErcByAbi(abi, percent = 100) {
    let percents = [];
    Object.keys(abis).forEach(key => {
        const checks = getSigs(abis[key]).length;
        const percent = 100 * getSigs(abi).filter(item => getSigs(abis[key]).includes(item)).length / checks;
        percents.push({ key, percent, checks });
    });
    percents.sort((a, b) => {
        if (a.percent === b.percent) {
            return b.checks - a.checks;
        }
        return b.percent - a.percent;
    });
    return percents[0].percent >= percent ? percents[0].key.toUpperCase() : undefined;
}

/**
 * Returns the ERC contract type based on the provided bytecode.
 * @param {string} bytecode - The bytecode of the contract.
 * @param {number} [percent=100] - The minimum percentage match required to determine the contract type.
 * @returns {string|undefined} - The ERC contract type or undefined if no match is found.
 */
function getErcByBytecode(bytecode, percent = 100) {
    let percents = [];
    Object.keys(abis).forEach(key => {
        const checks = getSigs(abis[key]).length;
        const percent = 100 * getSigs(abis[key]).filter(item => bytecode.includes(item.replace(/^0+/, ''))).length / checks;
        percents.push({ key, percent, checks });
    });
    percents.sort((a, b) => {
        if (a.percent === b.percent) {
            return b.checks - a.checks;
        }
        return b.percent - a.percent;
    });
    if (percents[0].percent >= percent){
        return percents[0].key.toUpperCase();
    }else{
        return getProxyStatus(bytecode);
    }
}

module.exports = { getErcByAbi, getErcByBytecode, isABI, getSigs, getProxyStatus }