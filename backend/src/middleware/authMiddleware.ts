import { Request, Response, NextFunction } from 'express';
import { HousingReviews } from '../models/Housing';
import { getFirebaseAuth } from '../firebaseAdmin';
import { Users } from '../models/User';

// MOBILE AUTH COMPATIBILITY: remove this bearer-token hydration once the
// frontend and API share a site and the cross-site session cookie is reliable.
export const hydrateBearerSession = async (
    req: Request,
    _res: Response,
    next: NextFunction
) => {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith('Bearer ') || req.session.user) {
        next();
        return;
    }

    try {
        const decodedToken = await getFirebaseAuth().verifyIdToken(
            authorization.slice('Bearer '.length)
        );
        const user = await Users.findOne({ uid: decodedToken.uid });

        if (user) {
            req.session.user = {
                id: user.uid,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                isAdmin: user.isAdmin,
            };
        }
    } catch (error) {
        console.error('Bearer authentication error:', error);
    }

    next();
};

export const isAuthenticated = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    if (!req.session.user) {
        res.status(401).json({ message: 'Authentication required' });
        return;
    }

    next();
};

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.user) {
        res.status(401).json({ message: 'Authentication required' });
        return;
    }

    if (!req.session.user.isAdmin) {
        res.status(403).json({ message: 'Admin access required' });
        return;
    }

    next();
};

export const isHousingReviewOwner = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    if (!req.session.user?.id) {
        res.status(401).json({ message: 'Authentication required' });
        return;
    }

    const review = await HousingReviews.findOne({
        id: Number(req.params.reviewId),
    });

    if (!review) {
        res.status(404).json({ message: 'Review not found' });
        return;
    }

    if (review.user_id !== req.session.user.id) {
        res.status(403).json({
            message: 'You are not authorized to modify this review',
        });
        return;
    }

    next();
};
