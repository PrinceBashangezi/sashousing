'use client';
import React from 'react';
import { useEffect, useState } from 'react';
import { ReviewFormProps } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import Image from 'next/image';
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
    const [pictures, setPictures] = useState<FileList | null>(null);
    const [pictureURLs, setPictureURLs] = useState<string[] | null>(null);

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
            const urlList: string[] = [];

            if (review.pictures) {
                for (const picture of review.pictures) {
                    urlList.push(
                        `${backendUrl}/api/campus/housing/review_pictures/${picture}`
                    );
                }
            }
            setPictureURLs(urlList);
        }
    }, [review]);

    const handleCommentsChange = (
        e: React.ChangeEvent<HTMLTextAreaElement>
    ) => {
        setComments(e.target.value);
    };

    const handlePicturesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setPictures(e.target.files);

        const urlList: string[] = [];
        if (e.target.files) {
            for (const file of e.target.files) {
                urlList.push(URL.createObjectURL(file));
            }
        }
        setPictureURLs(urlList);
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
            const formData = new FormData();
            formData.append('overall', ratings.overall.toString());
            formData.append('quiet', ratings.quiet.toString());
            formData.append('layout', ratings.layout.toString());
            formData.append('temperature', ratings.temperature.toString());
            formData.append('comments', comments);
            formData.append('email', user.email);

            if (pictures) {
                Array.from(pictures).forEach((file) => {
                    formData.append('pictures', file);
                });
            }

            const url = review
                ? `${backendUrl}/api/campus/housing/reviews/${review.id}`
                : `${backendUrl}/api/campus/housing/${buildingId}/${encodeURIComponent(roomNumber)}/reviews`;

            const method = review ? 'PATCH' : 'POST';

            const response = await fetch(url, {
                method,
                body: formData,
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

            {/* File Upload */}
            {/*<div>
                <label htmlFor="pictures">Upload Files:</label>
                <input
                    id="pictures"
                    type="file"
                    multiple
                    onChange={handlePicturesChange}
                    className="w-full rounded-md border border-sas-line p-2"
                />

                <div className="mt-2 flex gap-3 overflow-x-auto pb-2">
                    {pictureURLs &&
                        pictureURLs.length > 0 &&
                        pictureURLs.map((pictureURL, index) => (
                            <div key={index} className="shrink-0">
                                <Image
                                    src={pictureURL}
                                    alt={`Review image ${index + 1}`}
                                    width={200}
                                    height={200}
                                    className="h-24 w-24 rounded-md object-cover sm:h-[200px] sm:w-[200px]"
                                />
                            </div>
                        ))}
                </div>
            </div>*/}

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

export const PictureModal = ({
    isOpen,
    onClose,
    picture,
}: {
    isOpen: boolean;
    onClose: () => void;
    picture: string;
}) => {
    if (!isOpen) return null;

    return (
        <div
            className="fixed bottom-0 left-0 right-0 top-0 z-50 flex items-center justify-center bg-sas-black bg-opacity-40"
            onClick={onClose}
        >
            <div className="relative mx-4 max-h-[90vh] w-full max-w-[calc(100vw-2rem)] overflow-auto rounded-md bg-sas-white p-4 sm:mx-0 sm:max-w-4xl">
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute right-2 top-2 text-3xl font-bold text-sas-black/60 hover:text-sas-green"
                >
                    &times;
                </button>
                <Image
                    src={`${backendUrl}/api/campus/housing/review_pictures/${picture}`}
                    width={800}
                    height={800}
                    alt="Review picture"
                    className="h-auto max-h-[85vh] w-full object-contain"
                />
            </div>
        </div>
    );
};
