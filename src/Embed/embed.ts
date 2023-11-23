import * as gpt from '../GPT/gpt';


export async function GetEmbedding(source: Array<any> | String): Promise<Array<Array<number>>>{

    const response = await gpt.OpenAIAPI({
        model: 'text-embedding-ada-002',
        input: source,
        encoding_format: "float"

    }, 'https://api.openai.com/v1/embeddings');


    const EmbedingArray = response.data.map((value: any)=>{
        return value.embedding;
    })

    return EmbedingArray;
}

// Function to calculate cosine similarity between two vectors
export function CosineSimilarity(vectorA: Array<number>, vectorB: Array<number>) {
    const dotProduct = vectorA.reduce((acc, val, i) => acc + val * vectorB[i], 0);
    const magnitudeA = Math.sqrt(vectorA.reduce((acc, val) => acc + val ** 2, 0));
    const magnitudeB = Math.sqrt(vectorB.reduce((acc, val) => acc + val ** 2, 0));
    
    return dotProduct / (magnitudeA * magnitudeB);
}

// Function to perform a text search
export function PerformSearch(searchVector: Array<number>, otherVectors: Array<Array<number>>) {
    const rankedResults = otherVectors.map((vector, index) => {
        const similarity = CosineSimilarity(searchVector, vector);
        return { index, similarity };
    });

    // Sort results by similarity in descending order
    const sortedResults = rankedResults.sort((a, b) => b.similarity - a.similarity);

    // Return the top-ranked results
    const topResults = sortedResults.slice(0, 5);
    return topResults;
}