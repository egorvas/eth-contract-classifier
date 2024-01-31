const web3 = require('web3');
const {EVM} = require('evm');

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
 * Checks if the given bytecode contains a DELEGATECALL opcode.
 * @param {string} bytecode - The bytecode to check.
 * @returns {boolean} - Returns true if the bytecode contains a DELEGATECALL opcode, false otherwise.
 */
function isDelegateCall(bytecode) {      
    const evm = new EVM(bytecode);
    return evm.getOpcodes().find(x=>x.name==="DELEGATECALL")? "PROXY": undefined;
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
        const evm = new EVM(bytecode);
        const opcodes = evm.getOpcodes();  
        const push = opcodes.find(item => item.name === 'PUSH20');
        if (opcodes.find(x=>x.name==="DELEGATECALL" && push && push.pushData)) {
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
let bc ="0x6060604052600436106100825763ffffffff7c01000000000000000000000000000000000000000000000000000000006000350416631cd4cdd8811461023b5780635c7b79f51461025657806379ba50971461026c5780638da5cb5b1461027f578063d4ee1d90146102ae578063df7225eb146102c1578063f2fde38b146102ef575b6000808034151561009257600080fd5b60025492508215156100a75760009150610109565b6100ce6007546100c26006543461030e90919063ffffffff16565b9063ffffffff61033916565b9050610106816002600186038154811015156100e657fe5b90600052602060002090600302016002015461035a90919063ffffffff16565b91505b60075461011c903463ffffffff61035a16565b600755600280546001810161013183826108ae565b9160005260206000209060030201600060606040519081016040908152600160a060020a033316825234602083015281018690529190508151815473ffffffffffffffffffffffffffffffffffffffff1916600160a060020a039190911617815560208201518160010155604082015181600201555050507f3b1a7fd34cd733dee768b0bdaab63f3a0fc69a0a7bc95ada6a4c2a5b0ad24c3960075460405190815260200160405180910390a17f4dbb4490e0c137f42d2ab011f2ab7ef7910676830adab11c13d5795f91cb2c1883333485604051938452600160a060020a03909216602084015260408084019190915260608301919091526080909101905180910390a1505050005b341561024657600080fd5b61025460043560243561036a565b005b341561026157600080fd5b610254600435610413565b341561027757600080fd5b610254610671565b341561028a57600080fd5b6102926106ff565b604051600160a060020a03909116815260200160405180910390f35b34156102b957600080fd5b61029261070e565b34156102cc57600080fd5b6102d760043561071d565b60405191825260208201526040908101905180910390f35b34156102fa57600080fd5b610254600160a060020a036004351661084f565b818102821580610328575081838281151561032557fe5b04145b151561033357600080fd5b92915050565b600080821161034757600080fd5b818381151561035257fe5b049392505050565b8181018281101561033357600080fd5b60005433600160a060020a0390811691161461038557600080fd5b60055460045461039a9163ffffffff61033916565b6103aa838363ffffffff61033916565b11156103b557600080fd5b7f48ca72e2cd12d11fea19b3cfc399079f1b48eeeedff303ebb51409fff84708f860045460055484846040518085815260200184815260200183815260200182815260200194505050505060405180910390a1600491909155600555565b60008060008360001115801561042a575060025484105b151561043557600080fd5b33600160a060020a031660028581548110151561044e57fe5b6000918252602090912060039091020154600160a060020a03161461047257600080fd5b61047b8461071d565b600280549295509093506000918690811061049257fe5b60009182526020909120600390910201805473ffffffffffffffffffffffffffffffffffffffff1916600160a060020a039290921691909117905582158015906104db57508115155b15156104e657600080fd5b6007546104f9908363ffffffff61089916565b60075560055460045461051891906100c290869063ffffffff61030e16565b90507f3014322597970340a48e1bd8dce292de4337bd7d4539f7df645b3fb1684886d784338584604051938452600160a060020a03909216602084015260408084019190915260608301919091526080909101905180910390a17f3b1a7fd34cd733dee768b0bdaab63f3a0fc69a0a7bc95ada6a4c2a5b0ad24c3960075460405190815260200160405180910390a1600354600160a060020a031663a9059cbb33836000604051602001526040517c010000000000000000000000000000000000000000000000000000000063ffffffff8516028152600160a060020a0390921660048301526024820152604401602060405180830381600087803b151561061f57600080fd5b6102c65a03f1151561063057600080fd5b50505060405180515050600160a060020a03331683156108fc0284604051600060405180830381858888f19350505050151561066b57600080fd5b50505050565b60015433600160a060020a0390811691161461068c57600080fd5b600154600054600160a060020a0391821691167f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e060405160405180910390a3600180546000805473ffffffffffffffffffffffffffffffffffffffff19908116600160a060020a03841617909155169055565b600054600160a060020a031681565b600154600160a060020a031681565b6000806107286108df565b6107306108df565b600280548690811061073e57fe5b9060005260206000209060030201606060405190810160409081528254600160a060020a0316825260018301546020830190815260029093015490820152925051925060008251600160a060020a0316141561079d5760009350610848565b84156107aa5760006107ae565b6006545b600280549195509060001981019081106107c457fe5b9060005260206000209060030201606060405190810160409081528254600160a060020a031682526001830154602083015260029092015482820152915061082b9061081e9084015183604001519063ffffffff61089916565b859063ffffffff61035a16565b600654909450610845906100c2868663ffffffff61030e16565b93505b5050915091565b60005433600160a060020a0390811691161461086a57600080fd5b6001805473ffffffffffffffffffffffffffffffffffffffff1916600160a060020a0392909216919091179055565b6000828211156108a857600080fd5b50900390565b8154818355818115116108da576003028160030283600052602060002091820191016108da91906108ff565b505050565b606060405190810160409081526000808352602083018190529082015290565b61094291905b8082111561093e57805473ffffffffffffffffffffffffffffffffffffffff191681556000600182018190556002820155600301610905565b5090565b905600a165627a7a72305820fd10ee54578c0b64fc35a5085b768db7aa513868eae12cd89826e489514eb8ef0029"

async function main() {
    console.log(await getProxyAddress("0x5db4b520284049d7dcb21c6317664190791bb8e5","http://p15.amilabs.net:8545",bc));
}
main();

module.exports = { getErcByAbi, getErcByBytecode, isABI, getSigs, getProxyAddress, getErcByBytecodePercent, getErcByAbiPercent, getBytecodeSigns, isDelegateCall}