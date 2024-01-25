const web3 = require('web3');
const { EVM } = require("evm");
const abis = {
    erc20: require('./abis/erc20.json'),
    erc721: require('./abis/erc721.json'),
    erc1155: require('./abis/erc1155.json')
}

const abisMin = {
    erc20: require('./abis/erc20-min.json'),
    erc721: require('./abis/erc721-min.json'),
    erc1155: require('./abis/erc1155-min.json')
}

/**
 * Retrieves the function and event signatures from the given ABI.
 * @param {Array} abi - The ABI (Application Binary Interface) of the contract.
 * @returns {Array} - An array containing the function and event signatures.
 */
function getSigs(abi) {
    const abiFunctions = abi.filter(item => item.type === 'function')
    .map(item => web3.eth.abi.encodeFunctionSignature(item).replace("0x","").replace(/^0+/, ''));
    const abiEvents = abi.filter(item => item.type === 'event')
    .map(item => web3.eth.abi.encodeEventSignature(item).replace("0x","").replace(/^0+/, ''));
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
 * Returns the ERC contract key based on the provided ABI.
 * @param {object} abi - The ABI object.
 * @returns {string|undefined} - The ERC contract key or undefined if not found.
 */
function getErcByAbi(abi) {
    let points = [];
    Object.keys(abisMin).filter(key => getSigs(abisMin[key]).every(item => getSigs(abi).includes(item))).forEach(key => {
        points.push({ key, points: getSigs(abis[key]).filter(item=>getSigs(abi).includes(item)).length });
    });
    if (points.length > 0) {
        points.sort((a, b) => b.points - a.points);
        return points[0].key.toUpperCase();
    } else {
        return undefined;
    }
}


/**
 * Returns the ERC contract key based on the provided bytecode.
 * @param {string} bytecode - The bytecode of the contract.
 * @returns {string} - The ERC contract key.
 */
function getErcByBytecode(bytecode) {
    let points = [];
    Object.keys(abisMin).filter(key => isABI(abisMin[key], bytecode)).forEach(key => {
        points.push({ key, points: getSigs(abis[key]).filter(item=>bytecode.includes(item)).length });
    });
    if (points.length > 0) {
        points.sort((a, b) => b.points - a.points);
        return points[0].key.toUpperCase();
    } else {
        return getProxyStatus(bytecode);
    }
}

module.exports = { getErcByAbi, getErcByBytecode, isABI, getSigs, getProxyStatus }