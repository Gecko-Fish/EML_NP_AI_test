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

export function NormalizeVector(vector: Array<number>): Array<number> {
    const magnitude = Math.sqrt(vector.reduce((acc, val) => acc + val ** 2, 0));

    if (magnitude === 0) {
        throw new Error("Cannot normalize a zero vector");
    }
    
    return vector.map((val) => val / magnitude);
}

export function EuclideanDistance(vectorA: Array<number>, vectorB: Array<number>) {

    const distance = Math.sqrt(vectorA.reduce((acc, val, i) => acc + (val - vectorB[i]) ** 2, 0));

    // Adding 1 to put it in the range [0, 1]
    return 1 / (1 + distance);
}

export function ManhattanDistance(vectorA: Array<number>, vectorB: Array<number>) {

    const distance = vectorA.reduce((acc, val, i) => acc + Math.abs(val - vectorB[i]), 0);

    // Adding 1 to put it in the range [0, 1]
    return 1 / (1 + distance);
}

export function JaccardSimilarity(vectorA: Array<number>, vectorB: Array<number>) {
    
    const intersection = vectorA.reduce((acc, val, i) => acc + (val === 1 && vectorB[i] === 1 ? 1 : 0), 0);
    const union = vectorA.reduce((acc, val, i) => acc + (val === 1 || vectorB[i] === 1 ? 1 : 0), 0);
    
    return intersection / union;
}

export function CosineSimilarity(vectorA: Array<number>, vectorB: Array<number>) {
    const dotProduct = vectorA.reduce((acc, val, i) => acc + val * vectorB[i], 0);
    const magnitudeA = Math.sqrt(vectorA.reduce((acc, val) => acc + val ** 2, 0));
    const magnitudeB = Math.sqrt(vectorB.reduce((acc, val) => acc + val ** 2, 0));
    
    return dotProduct / (magnitudeA * magnitudeB);
}

export enum DistanceMetric {
    CosineSimilarity,
    EuclideanDistance,
    ManhattanDistance,
    JaccardSimilarity,
}

export function CalculateDistance(metric: DistanceMetric, vectorA: number[], vectorB: number[]): number {
    switch (metric) {
        case DistanceMetric.CosineSimilarity:
            return CosineSimilarity(vectorA, vectorB);
        case DistanceMetric.EuclideanDistance:
            return EuclideanDistance(vectorA, vectorB);
        case DistanceMetric.ManhattanDistance:
            return ManhattanDistance(vectorA, vectorB);
        case DistanceMetric.JaccardSimilarity:
            return JaccardSimilarity(vectorA, vectorB);
        default:
            throw new Error("Invalid distance metric");
    }
}

// Function to perform a text search
export function PerformSearch(metric: DistanceMetric, searchVector: Array<number>, otherVectors: Array<Array<number>>, numTopResult = 5) {
    const rankedResults = otherVectors.map((vector, index) => {
        const similarity = CalculateDistance(metric, searchVector, vector);
        return { index, similarity };
    });

    // Sort results by similarity in descending order
    const sortedResults = rankedResults.sort((a, b) => b.similarity - a.similarity);

    // Return the top-ranked results
    const topResults = sortedResults.slice(0, numTopResult);
    return topResults;
}