"use strict";
/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const grpc = __importStar(require("@grpc/grpc-js"));
const fabric_gateway_1 = require("@hyperledger/fabric-gateway");
const crypto = __importStar(require("crypto"));
const fs_1 = require("fs");
const path = __importStar(require("path"));
const util_1 = require("util");
const common = __importStar(require("fabric-common"));
const BlockDecoder = common.BlockDecoder;
const channelName = envOrDefault('CHANNEL_NAME', 'mychannel');
const chaincodeName = envOrDefault('CHAINCODE_NAME', 'basic');
const mspId = envOrDefault('MSP_ID', 'Org1MSP');
// Path to crypto materials.
const cryptoPath = envOrDefault('CRYPTO_PATH', path.resolve(__dirname, '..', '..', '..', 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com'));
// Path to user private key directory.
const keyDirectoryPath = envOrDefault('KEY_DIRECTORY_PATH', path.resolve(cryptoPath, 'users', 'User1@org1.example.com', 'msp', 'keystore'));
// Path to user certificate.
const certPath = envOrDefault('CERT_PATH', path.resolve(cryptoPath, 'users', 'User1@org1.example.com', 'msp', 'signcerts', 'cert.pem'));
// Path to peer tls certificate.
const tlsCertPath = envOrDefault('TLS_CERT_PATH', path.resolve(cryptoPath, 'peers', 'peer0.org1.example.com', 'tls', 'ca.crt'));
// Gateway peer endpoint.
const peerEndpoint = envOrDefault('PEER_ENDPOINT', 'localhost:7051');
// Gateway peer SSL host name override.
const peerHostAlias = envOrDefault('PEER_HOST_ALIAS', 'peer0.org1.example.com');
const utf8Decoder = new util_1.TextDecoder();
const assetId = `land2`;
async function main() {
    await displayInputParameters();
    // The gRPC client connection should be shared by all Gateway connections to this endpoint.
    const client = await newGrpcConnection();
    const gateway = (0, fabric_gateway_1.connect)({
        client,
        identity: await newIdentity(),
        signer: await newSigner(),
        // Default timeouts for different gRPC calls
        evaluateOptions: () => {
            return { deadline: Date.now() + 5000 }; // 5 seconds
        },
        endorseOptions: () => {
            return { deadline: Date.now() + 15000 }; // 15 seconds
        },
        submitOptions: () => {
            return { deadline: Date.now() + 5000 }; // 5 seconds
        },
        commitStatusOptions: () => {
            return { deadline: Date.now() + 60000 }; // 1 minute
        },
    });
    try {
        // Get a network instance representing the channel where the smart contract is deployed.
        const network = gateway.getNetwork(channelName);
        // Get the smart contract from the network.
        const contract = network.getContract(chaincodeName);
        // Initialize a set of asset data on the ledger using the chaincode 'InitLedger' function.
        await ReadAllBlocks(contract);
        //
        // // Initialize a set of asset data on the ledger using the chaincode 'InitLedger' function.
        await initLedger(contract);
        //
        // // Return all the current assets on the ledger.
        await GetAllLands(contract);
        //
        // // Create a new asset on the ledger.
        await CreateLandRecord(contract);
        //
        // // Update an existing asset asynchronously.
        // await TransferLand(contract);
        // // Get the asset details by assetID.
        await ReadLandRecord(contract);
        //
        // // Sell assetID.
        await SellLandRecord(contract);
        //
        //
        // // Return all the current assets on the ledger.
        await GetAllLands(contract);
        //
        // // Update an asset which does not exist.
        // await updateNonExistentLandRecord(contract)
    }
    finally {
        gateway.close();
        client.close();
    }
}
main().catch(error => {
    console.error('******** FAILED to run the application:', error);
    process.exitCode = 1;
});
async function newGrpcConnection() {
    const tlsRootCert = await fs_1.promises.readFile(tlsCertPath);
    const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
    return new grpc.Client(peerEndpoint, tlsCredentials, {
        'grpc.ssl_target_name_override': peerHostAlias,
    });
}
async function newIdentity() {
    const credentials = await fs_1.promises.readFile(certPath);
    return { mspId, credentials };
}
async function newSigner() {
    const files = await fs_1.promises.readdir(keyDirectoryPath);
    const keyPath = path.resolve(keyDirectoryPath, files[0]);
    const privateKeyPem = await fs_1.promises.readFile(keyPath);
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    return fabric_gateway_1.signers.newPrivateKeySigner(privateKey);
}
/**
 * This type of transaction would typically only be run once by an application the first time it was started after its
 * initial deployment. A new version of the chaincode deployed later would likely not need to run an "init" function.
 */
async function initLedger(contract) {
    // Initialize the land ledger using the chaincode 'InitLedger' function.
    console.log('\n--> Submit Transaction: InitLedger, initializes the set of lands on the ledger');
    await contract.submitTransaction('InitLedger');
    console.log('*** Transaction committed successfully');
}
/**
 * Evaluate a transaction to query ledger state.
 */
async function GetAllLands(contract) {
    console.log('\n--> Evaluate Transaction: GetAllAssets, function returns all the current assets on the ledger');
    const resultBytes = await contract.evaluateTransaction('GetAllLands');
    const resultJson = utf8Decoder.decode(resultBytes);
    const result = JSON.parse(resultJson);
    console.log('*** Result:', result);
}
/**
 * Submit a transaction synchronously, blocking until it has been committed to the ledger.
 */
async function CreateLandRecord(contract) {
    console.log('\n--> Submit Transaction: CreateLandRecord, creates new land record');
    await contract.submitTransaction('CreateLandRecord', 'land7', '3.5822048', '6.4501392', 'Samuel Doe', '124 Main St, Lagos', '1200000', 'Leasehold', 'No industrial development', 'Right of way for utilities', 'Mortgage with ABC Bank');
    console.log('*** Land record created successfully');
}
/**
 * Submit transaction asynchronously, allowing the application to process the smart contract response (e.g. update a UI)
 * while waiting for the commit notification.
 */
async function TransferLand(contract) {
    console.log('\n--> Submit Transaction: TransferLand, transfers land ownership');
    const commit = await contract.submitAsync('TransferLand', {
        arguments: [assetId, 'Alice'],
    });
    const oldOwner = utf8Decoder.decode(commit.getResult());
    console.log(`*** Successfully submitted transaction to transfer ownership from ${oldOwner} to Alice`);
    console.log('*** Waiting for transaction commit');
    const status = await commit.getStatus();
    if (!status.successful) {
        throw new Error(`Transaction ${status.transactionId} failed to commit with status code ${status.code}`);
    }
    console.log('*** Transaction committed successfully');
    console.log('*** Land ownership transferred successfully');
}
async function SellLandRecord(contract) {
    console.log('\n--> Submit Transaction: TransferLand, transfers land ownership');
    const commit = await contract.submitAsync('SellLand', {
        arguments: [assetId, 'Joe Zoe', '2000020'],
    });
    const oldOwner = utf8Decoder.decode(commit.getResult());
    console.log(`*** Successfully submitted transaction to sell property from ${oldOwner} to Joe Zoe`);
    console.log('*** Waiting for transaction commit');
    const status = await commit.getStatus();
    if (!status.successful) {
        throw new Error(`Transaction ${status.transactionId} failed to commit with status code ${status.code}`);
    }
    console.log('*** Transaction committed successfully');
    console.log('*** Land ownership transferred successfully');
}
async function ReadLandRecord(contract) {
    console.log('\n--> Evaluate Transaction: ReadLandRecord, returns updated land attributes');
    const resultBytes = await contract.evaluateTransaction('ReadLandRecord', assetId);
    const resultJson = utf8Decoder.decode(resultBytes);
    const result = JSON.parse(resultJson);
    console.log('*** Result:', result);
}
async function ReadAllBlocks(contract) {
    // let  ct = network.getContract('qscc');
    // console.log('\n--> Evaluate Transaction: Reading All Blocks');
    // const resultByte = await contract.evaluateTransaction(
    //     'GetBlockByNumber',
    //     channelName,
    //     String(11)
    // );
    // const resultJson = BlockDecoder.decode(resultByte);
    // console.log('*** Result:', resultJson);
}
/**
 * submitTransaction() will throw an error containing details of any error responses from the smart contract.
 */
async function updateNonExistentLandRecord(contract) {
    console.log('\n--> Submit Transaction: UpdateAsset land99, land99 does not exist and should return an error');
    try {
        await contract.submitTransaction('UpdateLandRecord', 'land99', 'Bob', '1000000', 'No mortgage');
        console.log('******** FAILED to return an error');
    }
    catch (error) {
        console.log('*** Successfully caught the error: \n', error);
    }
}
/**
 * envOrDefault() will return the value of an environment variable, or a default value if the variable is undefined.
 */
function envOrDefault(key, defaultValue) {
    return process.env[key] || defaultValue;
}
/**
 * displayInputParameters() will print the global scope parameters used by the main driver routine.
 */
async function displayInputParameters() {
    console.log(`channelName:       ${channelName}`);
    console.log(`chaincodeName:     ${chaincodeName}`);
    console.log(`mspId:             ${mspId}`);
    console.log(`cryptoPath:        ${cryptoPath}`);
    console.log(`keyDirectoryPath:  ${keyDirectoryPath}`);
    console.log(`certPath:          ${certPath}`);
    console.log(`tlsCertPath:       ${tlsCertPath}`);
    console.log(`peerEndpoint:      ${peerEndpoint}`);
    console.log(`peerHostAlias:     ${peerHostAlias}`);
}
//# sourceMappingURL=app.js.map