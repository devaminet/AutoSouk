import express from "express";
import authRouter from "./api/auth/routes";
import makeRouter from "./api/makes/routes";
import carModelRouter from "./api/car-models/router";
import carsRouter from "./api/cars/routes";
import listingRouter from "./api/listings/routes";
import favoriteListingRouter from "./api/favorite_listings/routes";

const router = express.Router();

router.use("/api/auth", authRouter);
router.use("/api/makes", makeRouter);
router.use("/api/models", carModelRouter);
router.use("/api/cars", carsRouter);
router.use("/api/listings", listingRouter);
router.use("/api/favorite_listings", favoriteListingRouter);

export default router;
