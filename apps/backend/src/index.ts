import express from "express";
import {
  GenerateImage,
  TrainModel,
  GenerateImagesFromPack,
} from "common/types";
import { prismaClient } from "db";
import dotenv from "dotenv";
import { S3Client } from "@aws-sdk/client-s3";
import { FalAIModel } from "../models/FalAIModel.js";
import cors from "cors";

dotenv.config();
const port = 3000;
const USER_ID = "12345";
const app = express();
app.use(cors());
app.use(express.json());

const falAiModel = new FalAIModel();

app.get("/pre-signed-url", async (req, res) => {
  const key = `models/${Date.now()}_${Math.random()}.zip`;
  //@ts-ignore
  const url = S3Client.presign(key, {
    method: "PUT",
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
    bucket: process.env.BUCKET_NAME,
    expiresIn: 60 * 5,
    endpoint: process.env.ENDPOINT,
    type: "application/zip",
  });
  res.json({
    url,
    key,
  });
});

app.post("/ai/training", async (req, res) => {
  const parsedBody = TrainModel.safeParse(req.body);
  const images = req.body.images;

  if (!parsedBody.success) {
    res.status(411).json({
      message: "Incorrect Inputs",
    });
    return;
  }

  const { request_id, response_url } = await falAiModel.trainModel(
    parsedBody.data.zipUrl,
    parsedBody.data.name
  );

  const data = await prismaClient.model.create({
    data: {
      name: parsedBody.data.name,
      type: parsedBody.data.type,
      age: parsedBody.data.age,
      ethinicity: parsedBody.data.ethinicity,
      eyeColor: parsedBody.data.eyeColor,
      bald: parsedBody.data.bald,
      userId: USER_ID,
      zipUrl: parsedBody.data.zipUrl,
      falAiRequestId: request_id,
    },
  });
  res.json({
    modelId: data.id,
  });
});
app.post("/ai/generate", async (req, res) => {
  const parsedBody = GenerateImage.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(411).json({
      message: "Incorrect Inputs",
    });
    return;
  }

  const model = await prismaClient.model.findUnique({
    where: {
      id: parsedBody.data.modelId,
    },
  });

  if (!model || !model.tensorPath) {
    res.status(411).json({
      message: "Model not found",
    });
    return;
  }

  const { request_id, response_url } = await falAiModel.generateImage(
    parsedBody.data.prompt,
    model.tensorPath
  );

  const data = await prismaClient.outputImages.create({
    data: {
      prompt: parsedBody.data.prompt,
      userId: USER_ID,
      modelId: parsedBody.data.modelId,
      imageUrl: "",
    },
  });
  res.json({
    imageUrl: data.id,
  });
});
app.post("/pack/generate", async (req, res) => {
  const parsedBody = GenerateImagesFromPack.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(411).json({
      message: "Incorrect Inputs",
    });
    return;
  }

  const prompts = await prismaClient.packPrompts.findMany({
    where: {
      packId: parsedBody.data.packId,
    },
  });

  let requestIds: { request_id: string }[] = await Promise.all(
    prompts.map((prompt) =>
      falAiModel.generateImage(prompt.prompt, parsedBody.data.modelId)
    )
  );
  const images = await prismaClient.outputImages.createManyAndReturn({
    data: prompts.map((prompt, index) => ({
      prompt: prompt.prompt,
      userId: USER_ID,
      modelId: parsedBody.data.modelId,
      imageUrl: "",
      falAiRequestId: requestIds[index]?.request_id ?? null,
    })),
  });
  res.json({
    images: images.map((image) => image.id),
  });
});
app.get("/pack/bulk", async (req, res) => {
  const packs = await prismaClient.packs.findMany({});
  res.json({
    packs,
  });
});
app.get("/image/bulk", async (req, res) => {
  const ids = req.query.images as string[];
  const limit = (req.query.limit as string) ?? "20";
  const offset = (req.query.offset as string) ?? "0";

  const imagesData = await prismaClient.outputImages.findMany({
    where: {
      id: { in: ids },
      userId: USER_ID,
    },
    skip: parseInt(offset),
    take: parseInt(limit),
  });
  res.json({
    images: imagesData,
  });
});

app.post("/fal-ai/webhook/train", async (req, res) => {
  console.log(req.body);
  //update the status of the image in the DB
  const requestId = req.body.request_id;

  await prismaClient.model.updateMany({
    where: {
      falAiRequestId: requestId,
    },
    data: {
      trainigStatus: "Generated",
      tensorPath: req.body.tensorPath,
    },
  });
  res.json({
    message: "webhook received",
  });
});
app.post("/fal-ai/webhook/image", async (req, res) => {
  console.log(req.body);
  //update the status of the image in the DB
  const requestId = req.body.request_id;

  await prismaClient.outputImages.updateMany({
    where: {
      falAiRequestId: requestId,
    },
    data: {
      status: "Generated",
      imageUrl: req.body.image_url,
    },
  });
  res.json({
    message: "webhook received",
  });
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
