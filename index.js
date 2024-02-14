const web3 = require('web3');
const {JsonRpcProvider } = require("ethers");
const {EVM} = require('evm');
const detectProxyTarget = require('evm-proxy-detection');

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

    const contract = new EVM(bytecode);
    if (beautify){
        return contract.getFunctions().concat(contract.getEvents());
    }else{
        const opcodes = contract.getOpcodes();
        const functions = [...new Set(opcodes.filter(opcode=> opcode.name === 'PUSH4' && opcode.pushData).map(opcode=>opcode.pushData.toString('hex')))]
        const events = [...new Set(opcodes.filter(opcode=> opcode.name === 'PUSH32' && opcode.pushData).map(opcode=>opcode.pushData.toString('hex')))]
        return functions.concat(events);
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
        return;
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
        return;
    }
}

async function getProxyAddresses(address){
    const proxy = await detectProxyTarget.default(
        address,
        ({ method, params }) => provider.send(method, params),
        "latest"
    );
    if (proxy===null){
        const bytecode = await provider.getCode(address);
        const evm = new EVM(bytecode);
        const opcodes = evm.getOpcodes();
        if (opcodes.find(x=>x.name==="DELEGATECALL")){
            return [...new Set(opcodes
                .filter(x => x.name === "PUSH20" && 
                x.pushData &&
                /^[a-f0-9]{40}$/.test(x.pushData.toString('hex')))
                .map(x=>"0x"+x.pushData.toString('hex'))
                .filter(x=> ![`0x${'f'.repeat(40)}`,`0x${'0'.repeat(40)}`].includes(x)))];
        }else{
            return [];
        }
    }else{
        return [proxy];
    }
}


async function getErcByNode(address, web3Url, bytecode){
    const provider = new JsonRpcProvider(web3Url);
    let fullBytecode = bytecode || await provider.getCode(address);
    let erc = getErcByBytecode(fullBytecode)
    if (!erc){
        let proxies = [];
        async function getProxies(address){
            let proxiesByAddress = await getProxyAddresses(address);
            for await (let proxy of proxiesByAddress){
                if (!proxies.includes(proxy)){
                    proxies.push(proxy);
                    await getProxies(proxy);
                }
            }
        }
        await getProxies(address);
        for await (let proxy of proxies){
            fullBytecode = fullBytecode + await provider.getCode(proxy);
        }
        erc = getErcByBytecode(fullBytecode);
    }
    return erc;
}

async function getErcByNodePercent(address, web3Url, bytecode, percent=100){
    const provider = new JsonRpcProvider(web3Url);
    let fullBytecode = bytecode || await provider.getCode(address);
    let erc = getErcByBytecodePercent(fullBytecode, percent)
    if (!erc){
        let proxies = [];
        async function getProxies(address){
            let proxiesByAddress = await getProxyAddresses(address);
            for await (let proxy of proxiesByAddress){
                if (!proxies.includes(proxy)){
                    proxies.push(proxy);
                    await getProxies(proxy);
                }
            }
        }
        await getProxies(address);
        for await (let proxy of proxies){
            fullBytecode = fullBytecode + await provider.getCode(proxy);
        }
        erc = getErcByBytecodePercent(fullBytecode, percent);
    }
    return erc;
}
module.exports = { getErcByAbi, getErcByBytecode, isABI, getSigs, getProxyAddresses, getErcByBytecodePercent, getErcByAbiPercent, getBytecodeSigns, getErcByNode, getErcByNodePercent}