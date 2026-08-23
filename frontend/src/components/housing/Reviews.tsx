'use client';
import React from 'react';
import { useEffect, useState } from 'react';
import { ReviewFormProps } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { backendUrl } from '@/utils/api';
import { getApiErrorMessage, getUserSafeMessage } from '@/utils/apiErrors';

type RatingCategory = 'overall' | 'quiet' | 'layout' | 'temperature';

export const ReviewForm: React.FC<ReviewFormProps> = ({
    review,
    buildingId,
    roomNumber,
}) => {
    const { user } = useAuth();

    const [ratings, setRatings] = useState({
        overall: 0,
        quiet: 0,
        layout: 0,
        temperature: 0,
    });

    const [hoveredStar, setHoveredStar] = useState<{
        overall: number;
        quiet: number;
        layout: number;
        temperature: number;
    }>({ overall: 0, quiet: 0, layout: 0, temperature: 0 });

    const handleStarClick = (category: RatingCategory, value: number) => {
        setRatings((prevRatings) => ({
            ...prevRatings,
            [category]: value,
        }));
    };

    const handleStarHover = (category: RatingCategory, value: number) => {
        setHoveredStar((prev) => ({
            ...prev,
            [category]: value,
        }));
    };

    const handleStarHoverOut = (category: RatingCategory) => {
        setHoveredStar((prev) => ({
            ...prev,
            [category]: 0,
        }));
    };

    const baseStarClass =
        'text-2xl leading-none transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-sas-green/30';

    const renderStars = (category: RatingCategory) => (
        <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((value) => {
                const isSelected =
                    ratings[category] >= value ||
                    hoveredStar[category] >= value;

                return (
                    <button
                        key={value}
                        type="button"
                        onClick={() => handleStarClick(category, value)}
                        onMouseEnter={() => handleStarHover(category, value)}
                        onMouseLeave={() => handleStarHoverOut(category)}
                        className={`${baseStarClass} ${
                            isSelected ? 'text-sas-green' : 'text-sas-line'
                        }`}
                        aria-label={`Set ${category} rating to ${value}`}
                    >
                        &#9733;
                    </button>
                );
            })}
        </div>
    );

    const [comments, setComments] = useState<string>('');
    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
    const [submitMessage, setSubmitMessage] = useState<string | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (review) {
            setRatings({
                overall: review.overall_rating || 0,
                quiet: review.quiet_rating || 0,
                layout: review.layout_rating || 0,
                temperature: review.temperature_rating || 0,
            });
            setComments(review.comments || '');
        }
    }, [review]);

    const handleCommentsChange = (
        e: React.ChangeEvent<HTMLTextAreaElement>
    ) => {
        setComments(e.target.value);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const errors: { [key: string]: string } = {};

        // Check if all ratings are selected
        if (ratings.overall === 0)
            errors.overall = 'Please select an overall rating.';
        if (ratings.quiet === 0) errors.quiet = 'Please select a quiet rating.';
        if (ratings.layout === 0)
            errors.layout = 'Please select a layout rating.';
        if (ratings.temperature === 0)
            errors.temperature = 'Please select a temperature rating.';

        // Check if comments are provided
        if (!comments.trim()) errors.comments = 'Please leave a comment.';

        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            setSubmitError(null);
            return;
        }

        setFormErrors({});
        try {
            setIsSubmitting(true);
            setSubmitMessage(null);
            setSubmitError(null);
            if (!user) {
                throw new Error('Error getting current user');
            }

            // Construct review request
            const reviewData = {
                overall: ratings.overall,
                quiet: ratings.quiet,
                layout: ratings.layout,
                temperature: ratings.temperature,
                comments,
                email: user.email,
            };

            const url = review
                ? `${backendUrl}/api/campus/housing/reviews/${review.id}`
                : `${backendUrl}/api/campus/housing/${buildingId}/${encodeURIComponent(roomNumber)}/reviews`;

            const method = review ? 'PATCH' : 'POST';

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reviewData),
                credentials: 'include',
            });

            if (!response.ok) {
                throw new Error(
                    await getApiErrorMessage(
                        response,
                        'Could not submit your review.'
                    )
                );
            }

            setSubmitMessage('Review submitted successfully.');
            setTimeout(() => window.location.reload(), 800);
        } catch (error) {
            console.error(error);
            setSubmitError(
                getUserSafeMessage(
                    error instanceof Error ? error.message : null,
                    'Could not submit your review.'
                )
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            {/* Overall Rating */}
            <div className="rating">
                <label>Overall: </label>
                {renderStars('overall')}
                {formErrors.overall && (
                    <p className="text-sm text-sas-green">
                        {formErrors.overall}
                    </p>
                )}
            </div>

            {/* Quiet Rating */}
            <div className="rating">
                <label>Quiet: </label>
                {renderStars('quiet')}
                {formErrors.quiet && (
                    <p className="text-sm text-sas-green">
                        {formErrors.quiet}
                    </p>
                )}
            </div>

            {/* Layout Rating */}
            <div className="rating">
                <label>Layout: </label>
                {renderStars('layout')}
                {formErrors.layout && (
                    <p className="text-sm text-sas-green">
                        {formErrors.layout}
                    </p>
                )}
            </div>

            {/* Temperature Rating */}
            <div className="rating">
                <label>Temperature: </label>
                {renderStars('temperature')}
                {formErrors.temperature && (
                    <p className="text-sm text-sas-green">
                        {formErrors.temperature}
                    </p>
                )}
            </div>

            {/* Comment Box */}
            <div>
                <label htmlFor="comments">Comments:</label>
                <textarea
                    id="comments"
                    value={comments}
                    onChange={handleCommentsChange}
                    placeholder="Write your comments here..."
                    rows={4}
                    className="w-full rounded-md border border-sas-line p-2 focus:outline-none focus:ring-2 focus:ring-sas-green"
                />
                {formErrors.comments && (
                    <p className="text-sm text-sas-green">
                        {formErrors.comments}
                    </p>
                )}
            </div>

            {/* Submit Button */}
            <button
                type="submit"
                disabled={isSubmitting}
                className="mt-4 rounded-md bg-sas-green px-4 py-2 font-medium text-sas-white hover:bg-sas-black disabled:opacity-60"
            >
                {isSubmitting ? 'Submitting...' : 'Submit'}
            </button>
            {submitError && (
                <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {submitError}
                </p>
            )}
            {submitMessage && (
                <p className="mt-3 rounded-md border border-sas-green/30 bg-sas-green/10 px-3 py-2 text-sm text-sas-green">
                    {submitMessage}
                </p>
            )}
        </form>
    );
};
