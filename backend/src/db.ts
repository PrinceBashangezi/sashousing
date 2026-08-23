import mongoose from 'mongoose';

let connectionPromise: Promise<typeof mongoose> | null = null;
export async function connectDb() {
    if (mongoose.connection.readyState === 1) {
        return;
    }

    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        throw new Error('MONGODB_URI is not defined');
    }

    if (!connectionPromise) {
        connectionPromise = mongoose.connect(mongoUri);
    }

    await connectionPromise;

}
