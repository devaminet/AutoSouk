import express from "express";
import authRouter from "./api/auth/routes";
import makeRouter from "./api/makes/routes";
import carModelRouter from "./api/car-models/router";
import listingRouter from "./api/listings/routes";

const router = express.Router();

router.use("/api/auth", authRouter);
router.use("/api/makes", makeRouter);
router.use("/api/models", carModelRouter);
router.use("/api/listings", listingRouter);

export default router;
