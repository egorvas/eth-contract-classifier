const web3 = require('web3');
const { Contract } = require('sevm');
require('sevm/4bytedb');

const SLOTS = ['0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc', 
'0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3', 
'0xc5f16f0fcc639fa48a6947836d9850f504798523bf8c9a3a87d5876cf622bcf7'];

const EIP_1967_BEACON_SLOT = '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50';
const EIP_1167_BEACON_METHODS = [
  '0x5c60da1b00000000000000000000000000000000000000000000000000000000',
  '0xda52571600000000000000000000000000000000000000000000000000000000',
];
const INTERFACES = [
'0x5c60da1b00000000000000000000000000000000000000000000000000000000', 
'0xa619486e00000000000000000000000000000000000000000000000000000000', 
'0xbb82aa5e00000000000000000000000000000000000000000000000000000000',
];

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
 * Returns an array of function and event signatures extracted from the given ABI.
 * @param {Array} abi - The ABI (Application Binary Interface) of the contract.
 * @returns {Array} - An array of function and event signatures.
 */
function getSigs(abi) {
    const abiFunctions = abi.filter(item => item.type === 'function')
    .map(item => web3.eth.abi.encodeFunctionSignature(item).replace("0x","").replace(/^0+/, ''));
    const abiEvents = abi.filter(item => item.type === 'event')
    .map(item => web3.eth.abi.encodeEventSignature(item).replace("0x","").replace(/^0+/, ''));
    return abiFunctions.concat(abiEvents);
}

/**
 * Retrieves the function and event signatures from the given bytecode.
 * @param {string} bytecode - The bytecode of the contract.
 * @param {boolean} [beautify=false] - Whether to beautify the signatures or not.
 * @returns {string[]} - An array of function and event signatures.
 */
function getBytecodeSigns(bytecode, beautify=false){
    const contract = new Contract(bytecode).patchdb();
    if (beautify){
        return contract.getFunctions().concat(contract.getEvents());
    }else{
        return Object.keys(contract.functions).concat(Object.keys(contract.events));
    }
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
 * Checks if the given bytecode contains a DELEGATECALL opcode.
 * @param {string} bytecode - The bytecode to check.
 * @returns {boolean} - Returns true if the bytecode contains a DELEGATECALL opcode, false otherwise.
 */
function isDelegateCall(bytecode) {      
    const contract = new Contract(bytecode).patchdb();  
    return contract.opcodes().find(x=>x.mnemonic==="DELEGATECALL")? true: false;
}

/**
 * Retrieves the proxy address for a given contract address.
 * @param {string} address - The contract address.
 * @param {string} web3Url - The URL of the Web3 provider.
 * @param {string} [bytecode] - The bytecode of the contract. If not provided, it will be fetched from the Web3 client.
 * @returns {Promise<string>} The proxy address of the contract.
 */
async function getProxyAddress(address,web3Url,bytecode){
    let proxyAddress;
    try{
        const web3Client = new web3.Web3(web3Url);
        if (!bytecode) bytecode = await web3Client.eth.getCode(address);
        const contract = new Contract(bytecode).patchdb();
        const opcodes = contract.opcodes();
        const push = opcodes.find(item => item.mnemonic === 'PUSH20');
        if (opcodes.find(x=>x.mnemonic==="DELEGATECALL" && push && push.pushData)) {
            proxyAddress = "0x"+push.pushData.toString('hex');
        }else{
            const getAddress = (value) =>{
                if (typeof value !== 'string' || value === '0x') {
                  throw new Error(`Invalid address value: ${value}`)
                }
                let address = value
                if (address.length === 66) {
                  address = '0x' + address.slice(-40)
                }
                const zeroAddress = '0x' + '0'.repeat(40)
                if (address === zeroAddress) {
                  throw new Error('Empty address')
                }
                return address
            }
            const tag = "latest";
            const requests = [];
            SLOTS.forEach(slot => requests.push(web3Client.eth.getStorageAt(address, slot, tag).then(getAddress)));
            INTERFACES.forEach(interface => requests.push(web3Client.eth.call({to:address, data:interface}, tag).then(getAddress)));
            requests.push(web3Client.eth.getStorageAt(address, EIP_1967_BEACON_SLOT, tag)
            .then(getAddress).then(beaconAddress => web3Client.eth.call({to:beaconAddress, data:EIP_1167_BEACON_METHODS[0]})
            .catch(() => web3Client.eth.call({to:beaconAddress, data:EIP_1167_BEACON_METHODS[1]})).then(getAddress)));
            proxyAddress = await Promise.any(requests).catch(() => undefined);
        }
    }catch(e){
        console.log(e);
    }
    return proxyAddress;
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
 * Calculates the percentage match of a given bytecode against a list of ERC contract ABIs.
 * @param {string} bytecode - The bytecode to be matched against the ABIs.
 * @param {number} [percent=100] - The minimum percentage match required for a contract to be considered ERC.
 * @returns {string} - The key of the ERC contract with the highest percentage match, or the proxy status if no match is found.
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
        return isDelegateCall(bytecode)?"DELEGATECALL":undefined;
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
 * Retrieves the ERC type of a contract based on its bytecode.
 * @param {string} bytecode - The bytecode of the contract.
 * @returns {string|undefined} - The ERC type of the contract, or undefined if it is not recognized.
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
        return isDelegateCall(bytecode)?"DELEGATECALL":undefined;
    }
}

module.exports = { getErcByAbi, getErcByBytecode, isABI, getSigs, getProxyAddress, getErcByBytecodePercent, getErcByAbiPercent, getBytecodeSigns, isDelegateCall}