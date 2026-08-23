import express, { Express, Request, Response, NextFunction } from 'express';
import MongoStore from 'connect-mongo';
import cors from 'cors';
import dotenv from 'dotenv';
import session from 'express-session';
import authRoutes from './routes/AuthRoutes';
import housingRoutes from './routes/HousingRoutes';
import { connectDb } from './db';
import { hydrateBearerSession } from './middleware/authMiddleware';

dotenv.config();

const app: Express = express();
const defaultFrontendOrigins = [
    'http://localhost:3000',
    'https://sashousing-frontend.vercel.app',
];
const frontendOrigins = [
    ...defaultFrontendOrigins,
    ...(process.env.FRONTEND_URL || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
];
const usesSecureFrontend =
    process.env.NODE_ENV === 'production' ||
    process.env.RENDER === 'true' ||
    Boolean(process.env.RENDER_SERVICE_ID) ||
    (process.env.FRONTEND_URL || '').includes('https://');
const mongoUri = process.env.MONGODB_URI;
const sessionSecret = process.env.SESSION_SECRET?.trim();

if (!mongoUri) {
    throw new Error('MONGODB_URI is not defined');
}

if (!sessionSecret) {
    throw new Error('SESSION_SECRET is not defined');
}

app.set('trust proxy', 1);

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || frontendOrigins.includes(origin)) {
                callback(null, true);
                return;
            }

            callback(new Error(`CORS origin not allowed: ${origin}`));
        },
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
    })
);

app.use(express.json());

app.use(
    session({
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,
        proxy: usesSecureFrontend,
        store: MongoStore.create({
            mongoUrl: mongoUri,
            ttl: 24 * 60 * 60,
            autoRemove: 'native',
        }),
        cookie: {
            secure: usesSecureFrontend,
            sameSite: usesSecureFrontend ? 'none' : 'lax',
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000,
        },
    })
);

app.use(async (_req: Request, _res: Response, next: NextFunction) => {
    try {
        await connectDb();
        next();
    } catch (error) {
        next(error);
    }
});

// MOBILE AUTH COMPATIBILITY: remove when same-site domains are available.
app.use(hydrateBearerSession);

app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
});

app.use('/api/auth', authRoutes);
app.use('/api/campus/housing', housingRoutes);

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
});

export default app;
