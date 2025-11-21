import express from "express";
import jwt from "jsonwebtoken";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import crypto from "crypto";

const app = express();
app.use(express.json());

// ----------------------
// CORS FIX (IMPORTANT)
// ----------------------
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ----------------------
// ENV VARIABLES
// ----------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Supabase Server Client
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// OpenAI Client
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// ----------------------
// ROOT ROUTE (FIXED)
// ----------------------
app.get("/", (req, res) => {
  res.send("Backend Working ✔ Root OK");
});

// ----------------------
// TEST ROUTE
// ----------------------
app.get("/test", (req, res) => {
  res.send("Backend Working Perfectly ✔");
});

// ----------------------
// JWT AUTH MIDDLEWARE
// ----------------------
function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const user = jwt.verify(token, JWT_SECRET);
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ----------------------
// SIGNUP (AUTO JWT)
// ----------------------
app.post("/signup", async (req, res) => {
  const { email } = req.body;
  const userId = crypto.randomUUID();

  const token = jwt.sign({ id: userId, email }, JWT_SECRET);

  await supabase.from("users").insert({ id: userId, email });

  return res.json({ token, userId });
});

// ----------------------
// ADD EXPENSE (AI CATEGORY)
// ----------------------
app.post("/expense", auth, async (req, res) => {
  const { amount, description } = req.body;

  // ---------- AI CATEGORY DETECTION ----------
  const ai = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Categorize the expense as Food, Shopping, Bills or Other ONLY.",
      },
      { role: "user", content: description },
    ],
  });

  const category = ai.choices[0].message.content.trim();

  // ---------- SAVE EXPENSE ----------
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      user_id: req.user.id,
      amount,
      description,
      category,
      currency: "INR", // ★ Always INR
      currency_symbol: "₹", // ★ Fix for frontend display
    })
    .select("*")
    .single();

  if (error) return res.status(400).json({ error });

  res.json({
    message: "Expense Added ✔",
    data,
  });
});

// ---------------------------------------
// EXTRA ROUTE: ADD EXPENSE MANUAL
// ---------------------------------------
app.post("/add-expense", auth, async (req, res) => {
  const { amount, description, category, user_id } = req.body;

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      user_id: user_id || req.user.id,
      amount,
      description,
      category: category || "Other",
      currency: "INR",
      currency_symbol: "₹",
    });

  if (error) return res.status(400).json({ error });

  res.json({ success: true, data });
});

// ----------------------
// GET EXPENSE LIST
// ----------------------
app.get("/expenses", auth, async (req, res) => {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .eq("user_id", req.user.id)
    .order("created_at", { ascending: false });

  if (error) return res.status(400).json({ error });

  res.json(data);
});

// ----------------------
// DELETE EXPENSE
// ----------------------
app.delete("/expense/:id", auth, async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from("expenses")
    .delete()
    .eq("id", id)
    .eq("user_id", req.user.id);

  if (error) return res.status(400).json({ error });

  res.json({ message: "Deleted ✔" });
});

// ----------------------
// SERVER START
// ----------------------
app.listen(3000, () => console.log("Backend Running on 3000"));
