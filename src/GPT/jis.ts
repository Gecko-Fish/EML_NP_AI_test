import http from 'http';
import https from 'https';
import formidable from 'formidable';
import FormData from 'form-data';
import { Readable } from 'stream';
import fs from 'fs';
import { readFile, writeFile, mkdir, rm, readdir, stat} from 'fs/promises';
import fetch, { Response } from 'node-fetch';
import { EventEmitter } from 'events';

import { encode, decode } from 'gpt-3-encoder'
import { IamAuthenticator } from 'ibm-watson/auth/index.js';
import TextToSpeechV1 from 'ibm-watson/text-to-speech/v1.js';
import SpeechToTextV1 from 'ibm-watson/speech-to-text/v1.js';
import { randomBytes, randomInt } from 'crypto';
import sanitize from 'sanitize-filename';

import dotenv from 'dotenv';
dotenv.config();


const WattsonTTSCredentials = dotenv.parse(fs.readFileSync('ibm-credentials-TTS.env')) || { TEXT_TO_SPEECH_APIKEY: '', TEXT_TO_SPEECH_URL: '' };
const WattsonSTTCredentials = dotenv.parse(fs.readFileSync('ibm-credentials-STT.env')) || { SPEECH_TO_TEXT_APIKEY: '', SPEECH_TO_TEXT_URL: '' };

export async function Whisper(options: any): Promise<any> {

    const requestOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'multipart/form-data; boundary=' + options.getBoundary(),
            'Authorization': 'Bearer ' + String(process.env.OPENAI_API_KEY)
        },
        body: options
    };

    try {
        return await fetch('https://api.openai.com/v1/audio/transcriptions', requestOptions);
    } catch (err) {
        console.error('API call error: ', err);
    }

}

async function OpenAIAPI(options: any, endPoint: string): Promise<any> {
    const requestOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + String(process.env.OPENAI_API_KEY)
        },
        body: JSON.stringify(options)
    };

    try {
        const reponse = await fetch(endPoint, requestOptions);
        return await reponse.json();
    } catch (err) {
        console.error('API call error: ', err);
    }
}

/**
 * @param options 
 * @param callback The function which handles the server's response
 */
function ChatGPTSSE(options: any, callback: any){

    const requestOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + String(process.env.OPENAI_API_KEY)
        }
    };

        const req = https.request('https://api.openai.com/v1/chat/completions', requestOptions, (res) => callback(res));
        
        // Write the data back to the server on the req ie request object
        req.write(JSON.stringify(options));
        req.end();
}


async function WattsonTTS(options: any) {
    const textToSpeech = new TextToSpeechV1({
        authenticator: new IamAuthenticator({
            apikey: WattsonTTSCredentials.TEXT_TO_SPEECH_APIKEY,
        }),
        serviceUrl: WattsonTTSCredentials.TEXT_TO_SPEECH_URL,
        disableSslVerification: true,
        headers: {
            'X-Watson-Learning-Opt-Out': 'true'
        }
    });

    try {
        const response = await textToSpeech.synthesize(options)
        // The following line is necessary only for
        // Wav formats; otherwise, `response.result`
        // Can be directly piped to a file.

        // Convert ReadableStream to Readable
        // Consider toggling this
        const readable = Readable.from(response.result);

        // Repair WAV header
        return textToSpeech.repairWavHeaderStream(readable);

    } catch (err) {
        console.error('API call error: ', err);
    }
}

// Socket verson can be used to detect <mark> and trigger animation
async function WattsonTTSSocket(options: any): Promise<any> {
    const textToSpeech = new TextToSpeechV1({
        authenticator: new IamAuthenticator({
            apikey: WattsonTTSCredentials.TEXT_TO_SPEECH_APIKEY,
        }),
        serviceUrl: WattsonTTSCredentials.TEXT_TO_SPEECH_URL,
        disableSslVerification: true,
    });

    try {
        const speechStream = textToSpeech.synthesizeUsingWebSocket(options);
        return (speechStream);

    } catch (err) {
        console.error('API call error: ', err);
    }
}

async function WattsonSTT(options: any): Promise<any> {

    /* * * * *
    * IBM CLOUD: Use the following code only to
    * authenticate to IBM Cloud.
    * * * * */

    const speechToText = new SpeechToTextV1({
        authenticator: new IamAuthenticator({
            apikey: WattsonSTTCredentials.SPEECH_TO_TEXT_APIKEY,
        }),
        serviceUrl: WattsonSTTCredentials.SPEECH_TO_TEXT_URL,
        disableSslVerification: true,
        headers: {
            'X-Watson-Learning-Opt-Out': 'true'
        }
    });

    /* * * * *
    * IBM CLOUD PAK FOR DATA: Use the following code
    * only to authenticate to IBM Cloud Pak for Data.
    * * * * */

    // const { CloudPakForDataAuthenticator } = require('ibm-watson/auth');
    // const speechToText = new SpeechToTextV1({
    //   authenticator: new CloudPakForDataAuthenticator({
    //     username: '{username}',
    //     password: '{password}',
    //     url: 'https://{cpd_cluster_host}{:port}',
    //  }),
    //  serviceUrl: '{url}',
    // });

    const params = {
        objectMode: true,
        contentType: 'audio/webm',
        model: 'en-US_Multimedia',
        timestamps: true,
        profanityFilter: true,
        lowLatency: false // quality may suffer if true
    };

    // Create the stream.
    const recognizeStream = speechToText.recognizeUsingWebSocket(params);

    // Pipe in the audio.
    // The file should be a read stream
    options.file.pipe(recognizeStream);

    /*
    * Uncomment the following two lines of code ONLY if `objectMode` is `false`.
    *
    * WHEN USED TOGETHER, the two lines pipe the final transcript to the named
    * file and produce it on the console.
    *
    * WHEN USED ALONE, the following line pipes just the final transcript to
    * the named file but produces numeric values rather than strings on the
    * console.
    */
    // recognizeStream.pipe(fs.createWriteStream('transcription.txt'));

    /*
    * WHEN USED ALONE, the following line produces just the final transcript
    * on the console.
    */
    // recognizeStream.setEncoding('utf8');

    return new Promise((resolve, reject) => {

        // Listen for events.
        recognizeStream.on('data', function (event: any) { onEvent('Data:', event); });
        recognizeStream.on('error', function (event: any) { onEvent('Error:', event); });
        recognizeStream.on('close', function (event: any) { onEvent('Close:', event); });

        function onEvent(name: any, event: any) {
            console.log(name, JSON.stringify(event, null, 2));

            // Return when data is available
            if (name === 'Data:') {
                
                // Check if the results array has information
                if(event.results.length>0){

                    // Find the maximum confidence
                    const confidences = event.results.map((result: any)=>{
                        return result.alternatives[0].confidence;
                    });
                    const maxConf = Math.max(...confidences);

                    // Use the first one with the maxium confidence
                    event.results.map((result: any)=>{
                        const conf = result.alternatives[0].confidence;
                        // Only do the following if you have max confidence
                        if(conf===maxConf){
                            
                            const transcript = result.alternatives[0].transcript;
                            const conf = result.alternatives[0].confidence;
                            const stamps = result.alternatives[0].timestamps;
                            
                            // Resolve is like return and will skip any further checks
                            resolve (
                                {
                                    transcript: transcript,
                                    timestamps: stamps
                                }
                            );

                        }
                    });


                } else {
                    resolve (
                        {
                            transcript: '',
                            timestamps: []
                        }
                    );
                }

                
                // Stamps have this format:
                // stamps.map((stamp:any)=>{
                //     const word = stamp[0];
                //     const word start = stamp[1];
                //     const word end = stamp[2];
                // })
                
            } else if (name === 'Error:'){
                reject(event);
            }
        };
    });
}


// Creation of a fileStream is resolved before preceding
async function resolveFileStreamPromise(filePath: any): Promise<fs.ReadStream> {

    return new Promise((resolve, error) => {

        const fileStream = fs.createReadStream(filePath);

        fileStream.on('open', () => {
            resolve(fileStream);
        });

        fileStream.on('error', (err) => {
            error(err);
        });
    });
}

// Convert a dictionary into formData
function createFormData(options: any): FormData {
    const formData = new FormData();

    for (const key in options) {
        if (options.hasOwnProperty(key)) {
            formData.append(key, options[key]);
        }
    }

    return formData;
}

/**
 * Creates a new message and appends it to the conversation
 * @param conversation List of OpenAI conversation messages
 * @param role One of 'user', 'assistant', 'system'
 * @param content The message to be appended
 * @returns List of OpenAI conversation messages
 */
function createConversation(conversation: Array<object>, role: string, content: string): Array<any> {
    let message = {role: role, content: content};
    let messages = [...conversation];
    messages.push(message);
    return messages;
}

import * as xml2js from 'xml2js';
import { parseBooleans } from 'xml2js/lib/processors.js';

async function validateDom(domString: string): Promise<boolean> {
    const parser = new xml2js.Parser();
    try {
        await parser.parseStringPromise(domString);
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Gets the proper value for the max_tokens field based in the message history tokens.
 * This addresses that ChatGTP counts the number of tokens in the history towards its maximum tokens
 * @param messages The message history
 * @param maxTokens The maximum number of tokens desired in the response
 * @returns The number of tokens in the message history + the maxmium number of tokens in the expected response
 */
function getTokenLimit(messages: Array<Object>, maxTokens: number){
    const jsonString = JSON.stringify(messages);
    const encoded = encode(jsonString);
    return encoded.length + maxTokens;
}

async function handleConverseRequestMultithread(req: any, res: any, clientId: string, callback: Function) {

    console.log('multithread started');
    console.log('client:', clientId);
    console.log('req:', req)

    try {

        // Read the incoming formData
        const form = new formidable.IncomingForm();

        // seperate files and fields
        const { fields, files }: any = await new Promise((resolve, reject) => {
            form.parse(req, (err, fields, files) => {
                if (err) {
                    // This should get caught by the try catch and be handled
                    // There is no need to try and continue with the rest of function if this fails
                    throw err;
                }

                resolve({ fields, files });
            });
        });

        // console.log('files: ', files);
        // console.log('fields: ', fields);
        console.log('FormData req read');

        let fileStream = undefined;
        let filePath;
        // Read the incoming audio file
        try {
            const incomingAudioPath = files.recording.filepath;
            const stats = await fs.promises.stat(incomingAudioPath);
            // Only continue with file reading if the file has data
            console.log('file stats: ', stats);
            if(stats.size !== 0){

                const audioFile = await readFile(incomingAudioPath);

                // Write the file to a local directory
                // This is mainly done because the Whisper API needs files to have their type ending
                // Otherwise it might be faster to stream it directly
                const fileDir = `clients/${clientId}`;
                await mkdir(fileDir, { recursive: true });
                filePath = `${fileDir}/audio-from-user.webm`;
                await writeFile(filePath, audioFile);
                fileStream = await resolveFileStreamPromise(filePath);
                console.log('stream: ', fileStream);
                console.log('Files read successfully');
            }

        } catch(err) {
            console.error(err);
        }

        let transcript: any = '';
        let timestamps: any = ['', 0,0];
        // This static if statement is for testing by switching between depreciated and new versions
        if(false) {

            // Options for STT
            const STTOptions = {
                file: fileStream,
                model: 'whisper-1',
                prompt: fields.transcriptPrompt || "",
                temperature: parseFloat(fields.transcriptTemperature) || 0,
                language: fields.transcriptLanguage || 'en',
            }

            // Convert to formData
            const STTOptionsData = createFormData(STTOptions);
            // Get Whisper response and then convert to json
            // const STTResponse = await Whisper(STTOptionsData);

            try {
                // Definitely not ideal but a good way to get timestamps for now
                // This done with a promise so that both calls are made at the same time and they are all resolved
                const STTResponses: any = await Promise.all ([
                    Whisper(STTOptionsData),
                    WattsonSTT({file: fileStream})
                ]);

                const STTResponse = STTResponses[0];

                const STTResponseJSON = await STTResponse.json();
                console.log('Response: ', STTResponse);

                transcript = STTResponseJSON.text || 'The message was undefined';

                timestamps = STTResponses[1].timestamps;

            } catch (err){
                console.error(err);
            }

        } else {

            try {

                if(fileStream !== undefined){

                    try{
                        console.log('Starting Wattson STT');
                        const STTResponse = await WattsonSTT({file: fileStream});
                        console.log('Wattson STT finished');
                        // There may be a better way to handle undefined responses than setting these defaults
                        transcript = STTResponse.transcript || '...';
                        timestamps = STTResponse.timestamps || [transcript, 0, 1];
                        console.log('transcript: ', transcript);
    
                    } catch(err){
                        console.log(err);
                    }

                    // User's audio is no longer required
                    try {
                        if(filePath){
                            await rm(filePath);
                            console.log('Removed user audio');
                        }
                    } catch(err){
                        console.error(err);
                    }
                    
                } else {
                    console.log('No read stream');
                }

            } catch(err) {

                console.error(err);
            }
        }


        let messages = JSON.parse(fields.messages);
        console.log('Chat Read: ', messages);

        // Add the user transcript as a user message to the received conversation
        messages = createConversation(messages, 'user', transcript);

        // Use ChatGTP to determine if a response will be given
        const determineResponding = async (conversation: any) => {

            // It would be good to expose some of these options to the client side
            // Note that the last user transcript has not yet been returned to the client
            // So that at least will need to come from this server
        
            try{
        
                const instruction = createConversation([], 'system', fields.determineRespondingInstructions || `
                Given the available data, give an assessment on how likely the assistant is to respond or if a response is expected by the user.
                Note that the sentances may not be complete or properly punctuated.
                Provide your assessment as a probabilty from 0 to 100 where 0 is a low likely hood of response and 100 is a high likely hood of response.
                `);
        
                // Convert the full conversation object into a string
                let transcript = JSON.stringify(conversation);
                // Shorten the transcript
                // This format may not be as easily read by chatGTP as plain text
                // It is an unedited verson of the OpenAI chatcompletion format
                // TODO: Fix that this may cuttof the differentation between the user and the assitant roles
                const relevantMemoryLength = fields.determineRespondingMemoryLength || 500;
                transcript = transcript.slice(transcript.length - relevantMemoryLength);
                const messages = createConversation(instruction, 'system', transcript);
        
                console.log('Assement Get Messages: ', messages);
        
                // ChatGTP function calling uses a JSON structured description of a function
                // ChatGTP is tasked with providing appropriate inputs to the described function ie it will not execute the function
                // In this case a general description of a hypothetical function respond_to_user(probability: number, responseType: string)
                // Helps ChatGTP return simple structured data without us needing to parse a whole response
                let functions = [ 
                    {
                        "name": "respond_to_user",
                        "description": "Give a response to the user given a response probability",
                        "parameters": {
                        "type": "object",
                        "properties": {
                            "probability": {
                            "type": "number",
                            "description": "The probability as a percentage that the user will get a response, e.g. 68"
                            },
                            "responseType": {
                                "type": "string",
                                "enum": ["answer", "question", "clarification", "comment", "banter", "explination", "critique"],
                                "description": "The kind of response that the user will probably get."
                            }
                        },
                        "required": ["probability", "responseType"]
                        }
                    }]
            
                if(fields.determineRespondingFunction){
                    try{
                        functions = [await JSON.parse(fields.determineRespondingFunction)];
                    } catch(err) {
                        console.error(err);
                    }
                }

                const chatResponseData = await OpenAIAPI({
                    model: 'gpt-3.5-turbo',
                    messages: messages,
                    temperature: 0.5,
                    max_tokens: getTokenLimit(messages, 100),
                    functions: functions,
                    function_call: {'name': 'respond_to_user'}
            
                }, 'https://api.openai.com/v1/chat/completions');
        
                console.log('response data: ', chatResponseData);
                
                const fcArguments = JSON.parse(chatResponseData.choices[0].message.function_call.arguments);
                // Note that using snake case may improve chatGPT's understanding of the variable's name
                const responseType = fcArguments.responseType || 'Failure to retrieve';
                const probability = fcArguments.probability || -1;
                console.log('probability of response: ', probability);
                console.log('kind of response: ', responseType);
                return fcArguments;
        
            } catch (err){
                console.error(err);
            }
        }

        
        let responseAssessment = {probability: 0, responseType: ''};
        let isResponding = true;
        // Set response is desired as the default value
        fields.isResponseDesired = parseBooleans(fields.isResponseDesired) || true;
        if(fields.isResponseDesired){
            // Disable chat response if not enough time has elapsed
            if(fields.lastResponseTime !== undefined){
                const timeSinceLastResponse = Date.now() - parseFloat(fields.lastResponseTime);
                const minimumResponseDelay = parseFloat(fields.minimumResponseDelay) || 30 * 1000;
                if (timeSinceLastResponse < minimumResponseDelay){
                    responseAssessment.probability = 0;
                    responseAssessment.responseType = `Response denied due to insufficient response delay: ${timeSinceLastResponse/1000}s / ${minimumResponseDelay/1000}s`;
                } else{
                    responseAssessment =  await determineResponding(messages);
                }

            } else {
                responseAssessment =  await determineResponding(messages);
            }

            let cutoff = parseFloat(fields.responseProbabilityCutoff) || 50;
            isResponding = responseAssessment.probability >= cutoff;  

        } else{
            // No response is desired
            isResponding = false;
        }

        if(isResponding){
          
            const desiredResponseTokens = parseFloat(fields.max_tokens) || 100;
            // Check if tokens exceed the maximum for the model
            // Then delete message history until the new response can be stored
            let maxTokens = getTokenLimit(messages, desiredResponseTokens);
            while(maxTokens >= 4096){

                // Find the first message that is not a system message
                let i = 0
                let message = messages[i];
                while(message.role === 'system'){
                    i++;
                    // Break out if there are only system messages
                    if(i > messages.length){
                        i = 0;
                        break;
                    }
                    message = messages[i];
                }

                // This will either remove the first non-system message or remove the first system message if there are no other types of messages
                // This may not be a great way to handle system messages. It may be better to throw an error.
                if(i >= 0){
                    messages.splice(i,1);
                }

                // Get the new max tokens 
                // If the number of tokens are still too high then the loop will repeat
                maxTokens = getTokenLimit(messages, desiredResponseTokens);
            }

            // Options for ChatGPT
            const ChatOptions = {
                model: fields.chatModel || 'gpt-3.5-turbo',
                messages: messages,
                temperature: parseFloat(fields.chatTemperature) || 0,
                max_tokens: maxTokens,
                stream: true
            }

            console.log('Options: ', ChatOptions);

            try{

                // OpenAI may be busy and have a long wait time or drop your request
                // If it takes too long for a response to start then abort or make another request
                new Promise<void>((resolve, reject) => {
                    setTimeout(()=>{resolve()}, ); 
                });

                let attempts = 0;
                const ChatGPTSSECallBack = (chatRes: any)=>{

                    let sentanceLength = 1;
                    let audioFileCount = 0;
                    let chatResponse = '';
                    const eventEmitter = new EventEmitter();

                    // ChatGPTSSE is conditionally recursive (consequently ChatGPTSSECallBack is recursive as well)
                    // If the gap between is the chat's reponses is too great
                    // Then make another attempt
                    new Promise<void>((resolve, reject) => {
                        if(attempts <= 3){
                            // The failure condition is if too much time has passed between receiving data
                            eventEmitter.on('lastResTimeUpdated', (updatedLastResTime) => {
                                const delay = Date.now()-updatedLastResTime;
                                if(delay > 5 * 1000){
                                    // Increment the number of attempts
                                    attempts ++;
                                    // Stop listening for the previous response
                                    chatRes.end();

                                    console.log(`ChatGTP took ${delay/1000}s. Making a new attemp.`)
                                    
                                    // Start the process again
                                    ChatGPTSSE(ChatOptions, ChatGPTSSECallBack);
                                }
                            });

                        } else {
                            // Too many faild attempts have been made
                            throw `ChatGTP took too long to respond. ${attempts} attempts were made. OpenAI may be busy at this time.`;
                        }
                    });

                    chatRes.on('data', (chunk: Buffer) => {

                        eventEmitter.emit('lastResTimeUpdated', Date.now());
                        
                        // Chunk is a buffer that can be implicitly converted but it is done explicitly here
                        const strChunk = chunk.toString();

                        // A given chunk may have  "data: {} \n\n data: {} \n\n" or "data: {} \n\n" or "data: [DONE] \n\n"
                        // The following is done to parse these into JSON objects
                        // By seperating each line of data, removing prefixs and white spaces, and ignoring non-JSON data

                        // Split data lines into array
                        const strChunkSplits = strChunk.split('\n\n');

                        let isDone = false;
                        // Run over each data line
                        strChunkSplits.map((elm: string)=>{
                            // Remove the data prefix
                            const cleanChunk = elm.slice('data:'.length).trim();

                            /* 
                            Note that when the request fails openAI also returns an "error:" instead of data
                            This error will be correctly formed as a JSON regardless of if the stream option is used
                            For example:
                            {
                                "error": {
                                    "message": "'role' is a required property - 'messages.0'",
                                    "type": "invalid_request_error",
                                    "param": null,
                                    "code": null
                                }
                            }

                            These should be handled better.
                            It would be possible to parse the string as a json and use a try-catch.
                            If an error is thrown then the data should be parsed like it is currently.
                            If an error is not thrown then the message is somewhat ironcially an error or stream was not used.
                             */
                            
                            if(cleanChunk === '[DONE]'){
                                
                                // With the current Regexp Checking for ". " ect will not include the last sentance
                                // Omitting the space from checks means that abreviations like A.B.C. will be seen as seperate sentances
                                // Therefore here, if the response is done the we add a space to the end

                                chatResponse += ' ';
                                isDone = true;

                            } else if(cleanChunk != ''){
                                // Convert to JSON and collect in array
                                //console.log('chunk: ', cleanChunk);
                                console.log(cleanChunk);
                                try{
                                    const chunkJson = JSON.parse(cleanChunk);
                                    chatResponse += chunkJson.choices[0].delta.content||'';
                                } catch(err){
                                    console.error('Errored Chunk:', cleanChunk);
                                    console.error(err);
                                }
                            }
                        });

                        // If the last peice of added data created a sentance ie. punctuation and a space
                        // Then generate the audio for that sentance

                        // This might be impotant to optimize since it done everytime that data comes in
                        // Find all matches of the delminators
                        const delimiters = ['.', '?', '!'];
                        const escapedDelimiters = delimiters.map(delimiter => `\\${delimiter} `);
                        const whitelist = ['Mr', 'Mrs', 'Ms', 'Dr', 'Sr', 'Jr', 'Prof', 'Hon', 'Esq'];

                        // ()   capture group
                        // .    any character
                        // *    look for all of a thing. So .* is look for all of any character
                        // ?    lazy so do .* lazy so that it is the smallest match
                        // ?:   don't try to capture these ie stop
                        // ?<!  look backward to avoid matching these
                        // (?<!${whitelist.join('|')}) this matches with the group of things that you should avoid matching with in the escapedDelimiter
                        // This prevents 'Mr' + '.' from being matched because 'Mr' is in the white list of things to match with

                        const pattern = new RegExp(`(.*?)(?:(?<!${whitelist.join('|')})${escapedDelimiters.join('|')})`, 'g');
                        
                        const sentences = chatResponse.match(pattern) || [];

                        const oldSentanceLength = sentanceLength;
                        sentanceLength = sentences.length;

                        //console.log('running data: ', chatResponse);
                        // If the sentance length has increased then promise to generate audio for it
                        // It starts at 1 so this will only trigger when there are 2 sentances and 1 is complete
                        if(sentanceLength > oldSentanceLength){

                            const utterance = sentences[sentanceLength-1];
                            (async() => {

                                // Here TTS can be satnitized for audio generation
                                let TTSText = utterance;

                                // TO DO: seperate the sentances that have action cues and deal with them seperately. The audio file generated will provide information about when to trigger animations
                                // It may be possible to replace [] with the SSML <mark> tag to indicate when an action is preformed but we need to switch to a websocket
                                // This will allow us to trigger an animation at the exact time it was intended
                                // https://cloud.ibm.com/docs/text-to-speech?topic=text-to-speech-elements
                                
                                // // Start an edit of the utterance to add actions
                                // // There is no need for this to be waited on but this can start in the background
                                // const editPromise = new Promise((resolve)=>{
                                //     // Options for OpenAI edit
                                //     const EditOptions = {
                                //         model: 'text-davinci-edit-001',
                                //         input: chatResponse,
                                //         instruction: 'Reformat to include some actions that the judge will act out based on what was said. Use the format [Action]. Ex Hello there. [Wave]',
                                //         temperature: 0.1
                                //     }

                                //     resolve(OpenAIAPI(EditOptions, 'https://api.openai.com/v1/edits'));
                                // });

                                const voice = fields.voice || 'en-US_EmmaExpressive';

                                // Add filler words to make it sound more natural
                                if(parseBooleans(fields.isPausingNaturally) || false){
                                    
                                    // Options for OpenAI edit
                                    const EditOptions = {
                                        model: 'text-davinci-edit-001',
                                        input: TTSText,
                                        instruction: 'Add a few natural filler words or hesitation markers as seen in natural speech. Filler words that may be used: "Um, Uh, Like, Well, You know, So, Ah, Er, Hmm, Ahem, Okay, Right, I mean, Anyway, Essentially". Add them sparingly if and where appropriate.',
                                        temperature: 0.1
                                    }
                                    
                                    try{
                                        const editResponseData = await OpenAIAPI(EditOptions, 'https://api.openai.com/v1/edits');
                                        TTSText = editResponseData.choices[0].text;
                                    } catch (err) {
                                        console.error(err)
                                    }

                                }

                                // Check if SSML is supported, ie it has expressive in the voice name
                                if (voice.includes('Expressive') && !parseBooleans(fields.disableSSML)) {

                                    // Options for OpenAI edit
                                    const EditOptions = {
                                        model: 'text-davinci-edit-001',
                                        input: TTSText,
                                        instruction: 'Reformat as SSML to mimic natural speech for Wattson TTS. Do not add to the content. Only use the elements: express-as (style can be cheerful, empathetic, neutral, or uncertain), and break.',
                                        temperature: 0.1
                                    }

                                    try{
                                        console.log('Before edit: ', TTSText);
                                        const editResponseData = await OpenAIAPI(EditOptions, 'https://api.openai.com/v1/edits');
                                        const SSMLchatResponse = editResponseData.choices[0].text;
                                        console.log('After edit: ', SSMLchatResponse);
                                        // Only replace TTS with SSML format if it is valid
                                        // This should be tested for reliability
                                        // It could be better to have n>1 in EditOptions and continue with the first valid response
                                        const isValid = await validateDom(SSMLchatResponse);
                                        if (isValid) {
                                            console.log('SSML is valid')
                                            TTSText = SSMLchatResponse;
                                        }
                                    } catch(err){
                                        console.error(err);
                                    }
                                }
                            
                                const TTSOptions = {
                                    text: TTSText || '',
                                    accept: 'audio/wav',
                                    voice: voice,
                                    ratePercentage: parseFloat(fields.ratePercentage) || 0,
                                    pitchPercentage: parseFloat(fields.pitchPercentage) || 0
                                };

                                let filePath;
                                try{
                                    const audioBuffer: Buffer = await WattsonTTS(TTSOptions) || await readFile('default.wav');

                                    // Write to local files with current time to differentiate files
                                    let fileDir = `clients/${clientId}/judge-audio`;
                                    await mkdir(fileDir, { recursive: true });
                                    const fileId = sanitize(`${sentences.length}-${utterance.slice(0,20)}-${Date.now()}`);
                                    filePath = `${fileDir}/${fileId}.wav`;

                                    // let filePath = `${fileDir}/${sentences.length}-${utterance.slice(50)}-${Date.now()}.wav`;
                                    //console.log('Writing TTS: ', filePath);
                                    await writeFile(filePath, audioBuffer);

                                    // Increment the file count
                                    // Note that reading the number of files in the directory does not tell you how many were generated
                                    // Some files may have been sent and deleted at any point
                                    audioFileCount++;
                                    // When done, write a log that tracks the expected total file count
                                    // This is currently being used mostly to track if audio generation is done and that the folder can be deleted when empty
                                    // WatchFile + unlink method would result in overhead when we only need to check when we are removing files
                                    if(isDone){
                                        const info = JSON.stringify({totalAudioFileCount: audioFileCount});
                                        console.log('info write');
                                        await writeFile(`${fileDir}/Info.json`, info);
                                        console.log('info written')
                                    }

                                    // Data to be sent back
                                    const data = {
                                        transcript: transcript,
                                        timestamps: timestamps,
                                        responseAssessment: responseAssessment,
                                        chatResponse: chatResponse,
                                        utterance: utterance,
                                        audioPath: filePath,
                                        isDone: isDone
                                    }

                                    // Pass the data back up to the callback function
                                    console.log('Passing data');
                                    callback(data);

                                } catch(err){
                                    // Throw the error up to where it is being handled
                                    // This is probably not the best practice
                                    throw err
                                }
                            })();
                        }
                    });

                    chatRes.on('end', () => {
                        // When the chat response is finished
                        // Note that this does not mean that all of the audio is done being processed but that chatGTP is no longer sending data

                    });

                }

                // Start the SSE attempt
                ChatGPTSSE(ChatOptions, ChatGPTSSECallBack);
                
            } catch(err){
                // Things to do when chatGTP or Wattson TTS fails
                console.error(err);
                console.log('Error in response. Passing transcript');

                // Data to be sent back
                const data = {
                    transcript: transcript,
                    timestamps: timestamps,
                    isDone: true
                }

                // Pass the data back up to the callback function
                callback(data);
            }

        } else {

            // Things to do when chatGTP chose not to respond
            console.log('No need to respond: ', responseAssessment);

            // Data to be sent back
            const data = {
                // We still want to send back the user's transcribed message
                transcript: transcript,
                timestamps: timestamps,
                responseAssessment: responseAssessment,
                // True is set as this is the only data that needs to be sent back
                isDone: true
            }

            // Pass the data back up to the callback function
            console.log('Passing no response data');
            callback(data);
        }

    } catch (err) {

        // Data to be sent back
        const data = {
            isDone: true
        }

        // Pass the data back up to the callback function
        console.log('Passing Error');
        callback(data);
        console.error(err);
    }
}


async function handleConverseRequest(req: any, res: any) {

    try {
        // Read the incoming formData
        const form = new formidable.IncomingForm();

        // seperate files and fields
        const { fields, files }: any = await new Promise((resolve, reject) => {
            form.parse(req, (err, fields, files) => {
                if (err) {
                    res.statusCode = 400;
                    res.end('Invalid request');
                    console.log(err);
                    reject(err);
                }

                resolve({ fields, files });
            });
        });

        // Read the incoming audio file
        const audioFile = await readFile(files.recording.filepath);

        // Write the file to a local directory
        // This is mainly done because the Whisper API needs files to have their type ending
        // In the future we may need to organize the files for each user
        let fileDir = 'Whisper STT Source Audio';
        await mkdir(fileDir, { recursive: true });
        let filePath = fileDir + '/' + 'audio-from-user.webm';
        await writeFile(filePath, audioFile);
        const fileStream = await resolveFileStreamPromise(filePath);

        // Options for STT
        const STTOptions = {
            file: fileStream,
            model: 'whisper-1',
            prompt: fields.transcriptPrompt || "",
            temperature: parseFloat(fields.transcriptTemperature) || 0,
            language: fields.transcriptLanguage || 'en',
        }

        // Convert to formData
        const STTOptionsData = createFormData(STTOptions);
        // Get Whisper response and then convert to json

        const STTResponse = await Whisper(STTOptionsData);
        const STTResponseJSON = await STTResponse.json();
        console.log('Response: ', STTResponse);

        // Transcript of user speech
        // To add analytics, take in the start and end time of the audio clip
        // Maybe add as metadata or field

        const transcript = STTResponseJSON.text || 'The message was undefined';
        console.log('transcript: ', transcript);

        let messages = JSON.parse(fields.messages);
        console.log('Chat Read: ', messages);
        messages = createConversation(messages, 'user', transcript);

        /*
        const chatResponseData = await OpenAIAPI({
            model: 'gpt-3.5-turbo',
            messages: [{messages}],
            temperature: parseFloat(fields.chatTemperature) || 0,
            max_tokens: parseFloat(fields.max_tokens) || 100,

        }, 'https://api.openai.com/v1/chat/completions');
        
        let assessingisResponding = chatResponseData.choices[0].message.content;
        */
        // In the future, parce a chatGTP assememt of if it should respond
        // Function calling may be a good method to get a true/false or number statment
        // set isresponding based on that

        let TTSfilePath = '';
        let chatResponse = '';
        const isResponding = true;
        if(isResponding){
          
            // Options for ChatGPT
            const ChatOptions = {
                model: 'gpt-3.5-turbo',
                messages: messages,
                temperature: parseFloat(fields.chatTemperature) || 0,
                max_tokens: parseFloat(fields.max_tokens) || 100,
                //stream: true
            }

            console.log('Options: ', ChatOptions);
            const chatResponseData = await OpenAIAPI(ChatOptions, 'https://api.openai.com/v1/chat/completions');
            console.log('Chat data: ', chatResponseData);
            chatResponse = chatResponseData.choices[0].message.content;

            // Remove the action cues.
            // It might be better to use an edit to add the actions as a seperate instruction

            // TO DO: seperate the sentances that have action cues and deal with them seperately. The audio file generated will provide information about when to trigger animations
            // It may be possible to replace [] with the SSML <mark> tag to indicate when an action is preformed but we need to switch to a websocket
            // This will allow us to trigger an animation at the exact time it was intended
            // https://cloud.ibm.com/docs/text-to-speech?topic=text-to-speech-elements

            // \[ \]    These are excaped with backslash so that [] is seen
            // .*?      match everything of any character
            // g        find all of this expression
            let TTSText = chatResponse.replace(/\[.*?\]/g, '');

            const voice = fields.voice || 'en-US_EmmaExpressive';

            // Check if SSML is supported, ie 
            if (voice.includes('Expressive')) {

                // Options for OpenAI edit
                const EditOptions = {
                    model: 'text-davinci-edit-001',
                    input: chatResponse,
                    instruction: 'Reformat as SSML to mimic natural speech for Wattson TTS. Do not add to the content. Only use the elements: express-as (style can be cheerful, empathetic, neutral, or uncertain), and break.',
                    temperature: 0.1
                }

                console.log('Before edit: ', TTSText);
                const editResponseData = await OpenAIAPI(EditOptions, 'https://api.openai.com/v1/edits');
                const SSMLchatResponse = editResponseData.choices[0].text;
                console.log('After edit: ', SSMLchatResponse);

                // Only replace TTS with SSML format if it is valid
                // This should be tested for reliability
                // It could be better to have n>1 in EditOptions and continue with the first valid response

                const isValid = await validateDom(SSMLchatResponse);
                if (isValid) {
                    TTSText = SSMLchatResponse;
                }
            }

            const TTSOptions = {
                text: TTSText || '',
                accept: 'audio/wav',
                voice: voice,
                ratePercentage: parseFloat(fields.ratePercentage) || 0,
                pitchPercentage: parseFloat(fields.pitchPercentage) || 0
            };

            // Text to speech API call
            const audioBuffer: Buffer = await WattsonTTS(TTSOptions) || await readFile('default.wav');

            // Write the buffer to a file with a randomized name
            fileDir = 'Wattson TTS Audio';
            await mkdir(fileDir, { recursive: true });
            const fileNum = randomInt(1000);
            filePath = `${fileDir}/chat-audio_${fileNum}.wav`;
            console.log('Writing TTS: ', filePath);
            await writeFile(filePath, audioBuffer);
            console.log('Writing TTS Success');

            // Transfer the file path
            TTSfilePath = filePath;

        } else {
            // Things to do when chatGTP does not want to respond

        }

        // Data to be sent back
        const data = {
            audioPath: TTSfilePath,
            chatResponse: chatResponse,
            transcript: transcript
        }

        const dataJSON = JSON.stringify(data);

        res.setHeader('Content-Type', 'application/json');
        console.log('Response sent');
        console.log(data);

        res.write(dataJSON);
        // End the response
        res.end();

        res.statusCode = 200;

    } catch (err) {
        console.error(err);
        res.statusCode = 500;
        res.end('Server error');
    }
}


async function handleAudioRequest(req: any, res: any) {

    try {
        // Read the incoming formData
        const form = new formidable.IncomingForm();

        // seperate files and fields
        const { fields, files }: any = await new Promise((resolve, reject) => {
            form.parse(req, (err, fields, files) => {
                if (err) {
                    res.statusCode = 400;
                    res.end('Invalid request');
                    console.log(err);
                    reject(err);
                }

                resolve({ fields, files });
            });
        });

        // Load the file from the requested path and send it back

        // Check if we are currently serving a client with the provided id
        // If not then reject their request
        const clientId = fields.clientId;
        if(clients.has(clientId)){
            if(fields.audioPath){
                try{
                    const audioBuffer = await readFile(fields.audioPath);
                    console.log('Audio sent: ', fields.audioPath);
            
                    res.writeHead(200, {
                        'Content-Type': 'audio/wav',
                        'Content-Length': audioBuffer.length.toString()
                    });
            
                    res.end(audioBuffer);
        
                    // Remove the file that was sent from the system
                    await rm(fields.audioPath);
                    
                    // Check if the last audio file was removed
                    // Generation is done when the Info.json file is present
                    // When Info.json is the only file left then we have removed all audio files
                    // When all audio files are removed then we have no need of client data
                    const fileDir = `clients/${clientId}/judge-audio`;
                    const fileName = 'Info.json';
                    const filesInDir = await readdir(fileDir)
                    if(filesInDir.length === 1 && filesInDir[0] === fileName){
                        await removeClient(clientId);
                    }

                } catch(err){
                    console.log(err);
                }
            } else {
                throw 'Audio not sent due to no audioPath in request';
            }

        }else{
            throw 'Audio not sent due to invalid client Id: ' + clientId;
        }

    } catch (err) {
        console.error(err);
        res.statusCode = 500;
        res.end('Server error');
    }
}

// A temporary service that is used to generate audio for the judge
async function handleTTSRequest(req: any, res: any) {

    try {
        // Read the incoming formData
        const form = new formidable.IncomingForm();

        // seperate files and fields
        const { fields, files }: any = await new Promise((resolve, reject) => {
            form.parse(req, (err, fields, files) => {
                if (err) {
                    res.statusCode = 400;
                    res.end('Invalid request');
                    console.log(err);
                    reject(err);
                }

                resolve({ fields, files });
            });
        });

        const TTSOptions = {
            text: fields.text || '',
            accept: 'audio/wav',
            voice: fields.voice || 'en-US_EmmaExpressive',
            ratePercentage: parseFloat(fields.ratePercentage) || 0,
            pitchPercentage: parseFloat(fields.pitchPercentage) || 0
        };

        // Text to speech API call
        const audioBuffer: Buffer = await WattsonTTS(TTSOptions) || await readFile('default.wav');

        // Write the buffer to files
        let fileDir = 'Wattson TTS Audio';
        await mkdir(fileDir, { recursive: true });
        // First several char of text used to differentiate files on sight
        // Current time used to avoid conflicts
        const fileId = `${TTSOptions.text.slice(0, 30)}`;
        let filePath = `${fileDir}/judge-audio_${fileId}.wav`;
        console.log('Writing TTS: ', filePath);
        await writeFile(filePath, audioBuffer);
        console.log('Writing TTS Success');

        console.log('Wattson finished');

        // Data to be sent back
        const data = {
            audioPath: filePath
        }

        const dataJSON = JSON.stringify(data);

        res.setHeader('Content-Type', 'application/json');
        console.log('Response sent');
        console.log(data);

        res.write(dataJSON);
        // End the response
        res.end();

        res.statusCode = 200;

    } catch (err) {
        console.error(err);
        res.statusCode = 500;
        res.end('Server error');
    }
}

const clients = new Map();

/**
 * Removes client data from the active list and from local files
 * @param clientId
 */
async function removeClient(clientId: string | undefined){
    // Remove the client from the list of clients
    clients.delete(clientId);
    // Delete the client files
    try {
        await rm(`clients/${clientId}`, { recursive: true, force: true });
    } catch(err){
        console.error(`Client ${clientId} not removed from files: ${err}`);
    }
}

function ConverseServe() {

    // Remove any client files that may still be on the server
    (async()=>{
    try {
        await rm(`clients`, { recursive: true, force: true });
    } catch(err) {
        console.error(`Client files not removed`);
    }
    })();
    
    console.log('Starting Converse Serve');
    //Server Settup
    const port = 8889;
    const server = http.createServer((req, res) => {

        
        let allowedOrigins = '*';
        // // Being specific when possible helps
        // if(req.headers.origin && req.headers.origin.startsWith('https://d1i25v58rmojzb.cloudfront.net')){
        //     allowedOrigins = 'https://d1i25v58rmojzb.cloudfront.net';

        // } else if(req.headers.origin && req.headers.origin.startsWith('https://da9sharzdma1i.cloudfront.net')){
        //     allowedOrigins = 'https://da9sharzdma1i.cloudfront.net';
        // }

        if (req.headers.origin){
            allowedOrigins = req.headers.origin;
        }

        console.log('Allowed Origin: ', allowedOrigins);

        // Add CORS headers to allow requests from specific origins
        res.setHeader('Access-Control-Allow-Origin', allowedOrigins);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');


        if (req.method === 'OPTIONS') {
            // Handle preflight OPTIONS request
            console.log('Preflight options sent');
            res.statusCode = 200;
            res.end();
            return;
        }

        // Request for full conversation
        if (req.url === '/api/converse' && req.method === 'POST') {
            handleConverseRequest(req, res);

            // Request for audio file
        } else if (req.url === '/api/audio' && req.method === 'POST') {
            handleAudioRequest(req, res);

            // Request for just TTS
        } else if (req.url === '/api/tts' && req.method === 'POST') {
            handleTTSRequest(req, res);

        // Request for full conversation without waiting for all the audio
        } else if (req.url === '/api/converse-multithread' && req.method === 'POST'){
            

            /*
            There is a list of all the clients that runs on the main script
            (This is outside of the server so there are no copies of it but it can be accessed from the servers that are created on request)
            When a client makes a POST with data it starts the processing in the background
            The clientId is immediately returned to the client
            The client can use their Id to listen to the server and wait for thier data to be ready
            They open a connection which stays open until closed so that data can be sent continously
            When data is ready an event is triggered which contains the response data
            This triggered event on the POST server causes the GET server to actually send the data
            This is possible because the listener is passed to the clients list on the main body of the server and not the one generated when a request is made
            Note that the client could be the same person but with multiple calls
            */

            // Register a new client using the current time and some random bytes as their Id
            // This provides some security as a valid Id is required to find most files
            const currentTimestamp = Date.now();
            const bytes = randomBytes(8).toString('hex');
            const clientId = `${currentTimestamp}_${bytes}`;

            // Create an event emitter with the data and assign it to the client
            // The client can now listen in on the event of their data being ready

            const clientEmitter = new EventEmitter();
            clients.set(clientId, clientEmitter);
            console.log('New Client: ', clients);

            
            // This function is not waited for. It will run in the background
            handleConverseRequestMultithread(req, res, clientId, (response: any)=>{
                // For this client set their response with new data
                console.log('Generated: ', response);

                const responseString = JSON.stringify(response);

                if(response.isDone === true){
                    
                    console.log('Process is done');

                    // TO DO: It would take some refactoring but it would be cleaner to trigger data and then end
                    // That way end does not need to handle a payload

                    // The client's emitter is triggered and signals completion
                    clientEmitter.emit('end', responseString);


                } else{
                    // The client's emitter is triggered and carries the response
                    clientEmitter.emit('data', responseString);
                }
            });

            // Send the client ID back to the client before the data has finished processing
            res.statusCode = 200;
            res.end(JSON.stringify({ clientId }));

        // Get method used to listen for data back
        } else if (req.url?.startsWith('/api/converse-multithread/') && req.method === 'GET'){
            // // Get the client id back from the query parameter in the url
            // const urlParts = req.url.split('?');
            // const query = new URLSearchParams(urlParts[1]);
            // const clientId = query.get('clientId')?.trim();
            const clientId = req.url.slice('/api/converse-multithread/'.length);

            //console.log('Clients: ', clients);
            console.log('Get converse at URL:', req.url);

            console.log('Client get request from:', clientId);
            
            // Check if the client ID is valid
            if (clients.has(clientId)) {
                console.log('client listening:', clientId);

                res.statusCode = 200;

                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');

                // Handshake
                res.write('event: connected\n');

                // Client's Emitter has data ready, send the response
                const clientEmitter = clients.get(clientId)
                clientEmitter.on('data', (response: any) => {
                    console.log('SSE event sent');
                    res.write(`event: data\n`);
                    res.write(`data: ${response}\n\n`);
                });

                // The data is done being generated
                // Forget the client and end the connection
                clientEmitter.on('end', (response: any) => {

                    console.log('SSE closed');

                    // End the response
                    res.write(`event: end\n`);
                    res.write(`data: ${response}\n\n`);
                    res.end();

                    // Delete client data
                    (async ()=>{
                        const data = await JSON.parse(response);
                        console.log('on End data: ', data);
                        if(!data.audioPath){
                            // An audio response was not generated and it is done so the client can be deleted
                            await removeClient(clientId);

                        } else {
                            // There are still files left to be sent
                            // Normally these files will be removed after being retrieved or used but the user may close the session without retrieving them
                            // It is possible the user will end the session and never retrieve them
                            // A long timeout is set so that the user has time to retrieve any files before they are removed

                            // Wait for x seconds and then delete the clients data
                            setTimeout(async ()=>{
                                await removeClient(clientId);
                            }, 60*1000);
                        }
                    })();
                });

            } else {

                console.log('Invalid clientId:', clientId);

                res.statusCode = 404;

                // End the response
                res.write(`event: end\n`);
                res.write('data: Invalid clientId');
                res.end();
            }

        // // Temporary for settup on EML servers
        // } else if (req.url === '/kill' && req.method === 'GET'){
        //     console.log('Kill url recieved');
        //     server.close(() => {
        //         console.log('Kill url stopped server');
        //     });

        } else {
            res.statusCode = 404;
            res.end(`Not found for url: ${req.url}`);
            console.log(`Rejected Request at: ${req.url}`);
        }
    });

    // // Temporary for settup on EML servers
    // setTimeout(async ()=>{

    //     server.close(() => {
    //         console.log('Planned server timeout');
    //     });

    // }, 2*60*1000);

    server.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });
}

export default ConverseServe