import express = require("express");
import {GenerateImage,TrainModel,GenerateImagesPack} from "common/types"
const app=express();
const port=3000;

app.post("/ai/training",(req,res)=>{
    
})
app.post("/ai/generate",(req,res)=>{
    
})
app.post("/pack/generate",(req,res)=>{
    
})
app.get("/pack/bulk",(req,res)=>{
    
})
app.get("/image",(req,res)=>{
    
})

app.listen(port,()=>{
    console.log(`Example app listening on port ${port}`)
})