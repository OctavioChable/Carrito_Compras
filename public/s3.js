import { S3Client, PutObjectCommand, ListObjectsCommand, GetObjectCommand } from "@aws-sdk/client-s3"
import {AWS_BUCKET_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_BUCKET_NAME} from './config.js'
import fs from 'fs'
import {getSignedUrl} from '@aws-sdk/s3-request-presigner'


const client = new S3Client({
    region: AWS_BUCKET_REGION,
    credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY
    }
})

export async function uploadFile(file){
    const stream = fs.createReadStream(file.tempFilePath)
    const uploadParams = {
        Bucket: AWS_BUCKET_NAME,
        Key: file.name,
        Body: stream
    }
    const command = new PutObjectCommand(uploadParams)
    //return await client.send(command)
    const result = await client.send(command)
    console.log("Archivo subido exitosamente:", result)
}

export async function getFiles(){
    const command =new ListObjectsCommand({
        Bucket: AWS_BUCKET_NAME
    })
    return await client.send(command)
}

export async function getFile(fileName){
    const command = new GetObjectCommand({
        Bucket: AWS_BUCKET_NAME,
        Key: fileName
    })
    //const result = await client.send(command)
    return await client.send(command)
    //console.log("Archivo obtenido exitosamente:", result)
}

export async function downloadFile(fileName){
    const command = GetObjectCommand({
        Bucket: AWS_BUCKET_NAME,
        Key: fileName
    })
    const result = await client.send(command)
    console.log(result)
    result.Body.pipe(fs.createWriteStream(`./images/${fileName}`))

}

export async function getFileURL(fileName){
    const command = new GetObjectCommand({
        Bucket: AWS_BUCKET_NAME,
        Key: fileName
    })
    //const result = await client.send(command)
    return await getSignedUrl(client, command, {expiresIn: 3600})
    //console.log("Archivo obtenido exitosamente:", result)
}