import https from 'https';
import { encode, decode } from 'gpt-3-encoder'

import dotenv from 'dotenv';
dotenv.config();

/**
 * Creates a new message and appends it to the conversation
 * @param conversation List of OpenAI conversation messages
 * @param role One of 'user', 'assistant', 'system'
 * @param content The message to be appended
 * @returns List of OpenAI conversation messages
 */
export function createConversation(conversation: Array<object>, role: string, content: string): Array<any> {
    let message = {role: role, content: content};
    let messages = [...conversation];
    messages.push(message);
    return messages;
}

/**
 * @param options 
 * @param callback The function which handles the server's response
 */
export async function ChatGPTSSE(options: any, endPoint: string, callback: Function){

    console.log('sending openai chat req');
    try{
        const requestOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + String(process.env.OPENAI_API_KEY)
            }
        };
    
            return new Promise<void>((resolve, reject) => {

                let isDone = false;
                const req = https.request(endPoint, requestOptions, (res) => {
                    res.on('data', async (chunk: Buffer) => {
                        isDone = await callback(chunk);
                        //console.log('done?', isDone);
                        if(isDone){
                            // console.log('resolved');
                            resolve();
                        }
                    });
                });

                // Write the data back to the server on the req ie request object
                req.write(JSON.stringify(options));
                req.end();
            });

    }catch(err){
        console.error(err);
    }

}


export default async function chatBot (messages: any, options?: any, callback?: Function){

    const OnChatResponse = async (chunk: Buffer)=>{

        // Chunk is a buffer that can be implicitly converted but it is done explicitly here
        const strChunk = chunk.toString();

        // This check assumes that stream is used
        let isOk = false;
        try{
            // JSON format is only provided for errors when using stream
            const err = JSON.parse(strChunk);
            console.error(err);

        }catch(err){

            // JSON conversion failed so there is no error in the response
            isOk = true;
        }

        let isDone = false;
        if(isOk){
            // A given chunk may have  "data: {} \n\n data: {} \n\n" or "data: {} \n\n" or "data: [DONE] \n\n"
            // The following is done to parse these into JSON objects
            // By seperating each line of data, removing prefixs and white spaces, and ignoring non-JSON data
        
            // Split data lines into array
            const strChunkSplits = strChunk.split('\n\n');

            // Run over each data line
            strChunkSplits.map((elm: string)=>{

                // Remove the data prefix
                const cleanChunk = elm.slice('data:'.length).trim();

                //console.log('chunk:', cleanChunk);

                if(cleanChunk == '[DONE]'){
                    isDone = true;
                    
                    // Passthrough with isDone true
                    if(callback){
                        // The function should return any edits to the chatResponse so that it is saved in the conversation
                        (async ()=>{
                            chatResponse = await callback(chatResponse, '', isDone);   
                        })();
                    }

                } else if(cleanChunk != ''){
                    try{
                        // Convert to JSON and collect in string
                        const chunkJson = JSON.parse(cleanChunk);
                        const chatResponseChunk = chunkJson.choices[0].delta.content||'';
                        chatResponse += chatResponseChunk;
                        
                        if(callback){
                            callback(chatResponse, chatResponseChunk);
                        }

                    } catch(err){
                        console.error(err);
                        console.error('error chunk:', cleanChunk);
                    }
                }
            });

        }else{
            // response is not okay but pass through
            isDone = true;
        }

        return isDone;
    };

    let chatResponse = '';

    const modelMax = 4097; // Set this to the max tokens for the model used
    const jsonString = JSON.stringify(messages);
    const inMessages = encode(jsonString).length;
    const inCompletion = 1000;
    let maxTokens = Math.min(modelMax - inMessages, inCompletion);

    // This method for forgetting history does not seem ideal
    while(maxTokens <= 0){

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
        // If the number of messages are still too high then the loop will repeat
        const jsonString = JSON.stringify(messages);
        const inMessages = encode(jsonString).length;
        maxTokens = Math.min(modelMax - inMessages, inCompletion); 
    }

    await ChatGPTSSE({
        model: options?.model || 'gpt-3.5-turbo',
        messages: messages,
        temperature: options?.temperature || 0.5,
        max_tokens: options?.maxTokens || maxTokens,
        functions: options?.functions || undefined,
        function_call: options?.function_call || undefined,
        stream: options?.stream !== undefined ? options.stream : true
    },
    'https://api.openai.com/v1/chat/completions',
    OnChatResponse);

    // return the updated message
    return {role: 'assistant', content: chatResponse};
}

/**
 * Make a simple http request with OpenAI key
 * @param options Paramaters sent as a payload
 * @param endPoint The endpoint url
 * @returns 
 */
export async function OpenAIAPI(options: any, endPoint: string): Promise<any> {
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


// let functions = [ 
//     {
//         "name": "respond_to_user",
//         "description": "Give a response to the user given a response probability",
//         "parameters": {
//         "type": "object",
//         "properties": {
//             "probability": {
//             "type": "number",
//             "description": "The probability as a percentage that the user will get a response, e.g. 68"
//             },
//             "responseType": {
//                 "type": "string",
//                 "enum": ["answer", "question", "clarification", "comment", "banter", "explination", "critique"],
//                 "description": "The kind of response that the user will probably get."
//             }
//         },
//         "required": ["probability", "responseType"]
//         }
//     }]