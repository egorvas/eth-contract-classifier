const web3 = require('web3');
const { EVM } = require("evm");
const abis = {
    erc1155: require('./abis/ERC1155.json'),
    erc721: require('./abis/ERC721.json'),
    erc20: require('./abis/ERC20.json')
}

const abisMin = {
    erc20: require('./abis/ERC20-min.json'),
    erc721: require('./abis/ERC721-min.json'),
    erc1155: require('./abis/ERC1155-min.json')
}

const abisMax = {
    erc20: require('./abis/ERC20-max.json'),
    erc721: require('./abis/ERC721-max.json'),
    erc1155: require('./abis/ERC1155-max.json')
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
 * Returns the ERC token with the highest percentage match to the given ABI.
 * @param {object} abi - The ABI object to compare against.
 * @param {number} [percent=100] - The minimum percentage match required.
 * @returns {string|undefined} - The key of the ERC token with the highest match percentage, or undefined if no match is found.
 */
function getErcByAbiPercent(abi, percent = 100) {
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
function getErcByBytecodePercent(bytecode, percent = 100) {
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


/**
 * Returns the ERC contract key based on the provided ABI.
 * @param {object} abi - The ABI object.
 * @returns {string|undefined} - The ERC contract key or undefined if not found.
 */
function getErcByAbi(abi) {
    let points = [];
    Object.keys(abisMin).filter(key => getSigs(abisMin[key]).every(item => getSigs(abi).includes(item))).forEach(key => {
        points.push({ key, points: getSigs(abisMax[key]).filter(item=>getSigs(abi).includes(item)).length });
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
        points.push({ key, points: getSigs(abisMax[key]).filter(item=>bytecode.includes(item)).length });
    });
    if (points.length > 0) {
        points.sort((a, b) => b.points - a.points);
        return points[0].key.toUpperCase();
    } else {
        return getProxyStatus(bytecode);
    }
}

module.exports = { getErcByAbi, getErcByBytecode, isABI, getSigs, getProxyStatus }