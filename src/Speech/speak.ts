// https://api.openai.com/v1/audio/speech


// import fs from "fs";
// import path from "path";
// import OpenAI from "openai";

// const openai = new OpenAI();

// const speechFile = path.resolve("./speech.mp3");

// async function main() {
//   const mp3 = await openai.audio.speech.create({
//     model: "tts-1",
//     voice: "alloy",
//     input: "Today is a wonderful day to build something people love!",
//   });
//   console.log(speechFile);
//   const buffer = Buffer.from(await mp3.arrayBuffer());
//   await fs.promises.writeFile(speechFile, buffer);
// }
// main();


// /**
//  * Make a simple http request with OpenAI key
//  * @param options Paramaters sent as a payload
//  * @param endPoint The endpoint url
//  * @returns 
//  */
// export async function OpenAIAPI(options: any, endPoint: string): Promise<any> {
//     const requestOptions = {
//         method: 'POST',
//         headers: {
//             'Content-Type': 'application/json',
//             'Authorization': 'Bearer ' + String(process.env.OPENAI_API_KEY)
//         },
//         body: JSON.stringify(options)
//     };

//     try {
//         const reponse = await fetch(endPoint, requestOptions);
//         return await reponse.json();
//     } catch (err) {
//         console.error('API call error: ', err);
//     }
// }