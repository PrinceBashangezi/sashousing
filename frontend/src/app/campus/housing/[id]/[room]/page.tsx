'use client';

import LoginRequired from '@/components/LoginRequired';
import Pagination from '@/components/Pagination';
import AppModal from '@/components/AppModal';
import Skeleton, { ReviewSkeleton } from '@/components/Skeleton';
import { ReviewForm } from '@/components/housing/Reviews';
import { StarRating, getRoomOccupancyType } from '@/components/housing/Rooms';
import { useAuth } from '@/hooks/useAuth';
import { Review, RoomWithReviews } from '@/types';
import { FormattedReviewText } from '@/utils/textFormatting';
import { backendUrl } from '@/utils/api';
import { getApiErrorMessage, getUserSafeMessage } from '@/utils/apiErrors';
import { getBuildingSlug } from '@/utils/housingText';
import { useParams, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useRef, useState } from 'react';

type BuildingSearchDoc = {
    id: number;
    name: string;
};

const RoomPage = () => {
    const params = useParams();
    const { id, room } = params;
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [buildingName, setBuildingName] = useState<string>('');
    const [buildingId, setBuildingId] = useState<number | null>(null);
    const [roomNumber, setRoomNumber] = useState<string>('');
    const [roomReviews, setRoomReviews] = useState<RoomWithReviews | null>(
        null
    );
    const [isCreatingNew, setIsCreatingNew] = useState(false);
    const [selectedReview, setSelectedReview] = useState<Review | null>(null);
    const [pendingDeleteReviewId, setPendingDeleteReviewId] = useState<
        number | null
    >(null);
    const [showCancelEditModal, setShowCancelEditModal] = useState(false);
    const [pageMessage, setPageMessage] = useState<string | null>(null);
    const [pageError, setPageError] = useState<string | null>(null);
    const [reviewPage, setReviewPage] = useState(1);

    const handleAddNewReviewClick = (shouldScrollToForm = false) => {
        if (isCreatingNew) {
            setIsCreatingNew(false);
        } else if (selectedReview) {
            setShowCancelEditModal(true);
        } else {
            setIsCreatingNew(true);
        }

        if (shouldScrollToForm) {
            scrollToReviewForm();
        }
    };

    useEffect(() => {
        const fetchReviews = async () => {
            try {
                setLoading(true);
                const buildingParam = Array.isArray(id) ? id[0] : id;
                const roomParam = Array.isArray(room) ? room[0] : room;
                let buildingId = Number(buildingParam);

                if (Number.isNaN(buildingId)) {
                    const searchIndexResponse = await fetch(
                        `${backendUrl}/api/campus/housing/search-index`,
                        { credentials: 'include' }
                    );
                    if (!searchIndexResponse.ok) {
                        throw new Error('Failed to resolve building');
                    }

                    const buildings =
                        (await searchIndexResponse.json()) as BuildingSearchDoc[];
                    const matchingBuilding = buildings.find(
                        (building) =>
                            getBuildingSlug(building.name) === buildingParam
                    );
                    if (!matchingBuilding) {
                        throw new Error('Building not found');
                    }

                    buildingId = matchingBuilding.id;
                }

                setBuildingId(buildingId);
                setRoomNumber(roomParam || '');

                const [buildingResponse, reviewsResponse] = await Promise.all([
                    fetch(
                        `${backendUrl}/api/campus/housing/${buildingId}`,
                        {
                            credentials: 'include',
                        }
                    ),
                    fetch(
                        `${backendUrl}/api/campus/housing/${buildingId}/${roomParam}/reviews?page=1&pageSize=100`,
                        {
                            credentials: 'include',
                        }
                    ),
                ]);

                if (!buildingResponse.ok)
                    throw new Error(
                        `Failed to fetch building: ${buildingResponse.status}`
                    );
                if (!reviewsResponse.ok)
                    throw new Error(
                        `Failed to fetch reviews: ${reviewsResponse.status}`
                    );

                const [buildingData, reviewsData] = await Promise.all([
                    buildingResponse.json(),
                    reviewsResponse.json(),
                ]);

                setBuildingName(buildingData.name);
                setRoomReviews(reviewsData);
            } catch (error) {
                console.error('Error fetching room reviews:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchReviews();
    }, [id, room]);

    const reviewsPerPage = 10;
    const reviewTotalPages = roomReviews
        ? Math.max(1, Math.ceil(roomReviews.reviews.length / reviewsPerPage))
        : 1;
    const paginatedReviews = roomReviews
        ? roomReviews.reviews.slice(
              (reviewPage - 1) * reviewsPerPage,
              reviewPage * reviewsPerPage
          )
        : [];

    useEffect(() => {
        if (reviewPage > reviewTotalPages) setReviewPage(reviewTotalPages);
    }, [reviewPage, reviewTotalPages]);

    const targetRef = useRef<HTMLButtonElement | null>(null);

    const scrollToReviewForm = () => {
        setTimeout(() => {
            if (targetRef.current) {
                targetRef.current.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                });
            }
        }, 0);
    };

    const reviewActionLabel = selectedReview
        ? 'Cancel review edit'
        : isCreatingNew
          ? 'Cancel new review'
          : 'Add Review';

    if (loading) {
        return (
            <div className="min-h-screen bg-sas-mist text-sas-black">
                <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
                    <Skeleton className="mb-6 h-10 w-24" />
                    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <Skeleton className="h-9 w-80" />
                        <Skeleton className="h-10 w-32" />
                    </div>
                    <ReviewSkeleton />
                    <div className="mt-6 grid gap-4">
                        {Array.from({ length: 3 }).map((_, index) => (
                            <ReviewSkeleton key={index} />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    const formatDate = (date: Date) => {
        const d = new Date(date);
        const month = d.toLocaleString('default', { month: 'long' });
        const year = d.getFullYear();
        return `${month} ${year}`;
    };

    const handleDelete = async () => {
        if (pendingDeleteReviewId === null) {
            return;
        }

        try {
            setLoading(true);
            setPageMessage(null);
            setPageError(null);
            const response = await fetch(
                `${backendUrl}/api/campus/housing/reviews/${pendingDeleteReviewId}`,
                {
                    method: 'DELETE',
                    credentials: 'include',
                }
            );

            if (!response.ok) {
                throw new Error(
                    await getApiErrorMessage(
                        response,
                        'Failed to delete review'
                    )
                );
            }

            setPendingDeleteReviewId(null);
            setPageMessage('Review deleted successfully.');
            setTimeout(() => window.location.reload(), 800);
        } catch (error) {
            console.error('Error deleting review', error);
            setPendingDeleteReviewId(null);
            setPageError(
                getUserSafeMessage(
                    error instanceof Error ? error.message : null,
                    'Failed to delete review'
                )
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-sas-mist text-sas-black">
            <RoomReviewAuthBoundary>
                <AppModal
                    isOpen={showCancelEditModal}
                    title="Cancel Review Edit?"
                    onClose={() => setShowCancelEditModal(false)}
                    actions={
                        <>
                            <button
                                type="button"
                                onClick={() => setShowCancelEditModal(false)}
                                className="rounded-md border border-sas-green px-4 py-2 text-sm font-medium text-sas-green hover:bg-sas-green hover:text-sas-white"
                            >
                                Keep Editing
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedReview(null);
                                    setShowCancelEditModal(false);
                                }}
                                className="rounded-md bg-sas-green px-4 py-2 text-sm font-medium text-sas-white hover:bg-sas-black"
                            >
                                Discard Changes
                            </button>
                        </>
                    }
                >
                    Any changes in the review form will be lost.
                </AppModal>
                <AppModal
                    isOpen={pendingDeleteReviewId !== null}
                    title="Delete Review?"
                    onClose={() => setPendingDeleteReviewId(null)}
                    actions={
                        <>
                            <button
                                type="button"
                                onClick={() => setPendingDeleteReviewId(null)}
                                className="rounded-md border border-sas-green px-4 py-2 text-sm font-medium text-sas-green hover:bg-sas-green hover:text-sas-white"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDelete}
                                className="rounded-md bg-sas-green px-4 py-2 text-sm font-medium text-sas-white hover:bg-sas-black"
                            >
                                Delete Review
                            </button>
                        </>
                    }
                >
                    This review will be permanently removed.
                </AppModal>
                <div
                    className={`mx-auto max-w-6xl px-4 py-8 sm:px-6 ${!isCreatingNew && !selectedReview ? 'pb-24' : ''}`}
                >
                {/* Back Button */}
                <button
                    onClick={() => router.push(`/campus/housing/${buildingId}`)}
                    className="mb-6 inline-flex items-center rounded-md border border-sas-line bg-sas-white px-4 py-2 text-sm font-medium text-sas-black shadow-sm hover:border-sas-green hover:text-sas-green focus:outline-none focus:ring-2 focus:ring-sas-green focus:ring-offset-2"
                >
                    Back
                </button>

                <div className="mb-8">
                    <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <h1 className="font-display text-2xl font-semibold text-sas-black sm:text-3xl">
                            Reviews for {buildingName} {room}
                        </h1>
                        <button
                            className="w-fit rounded-md bg-sas-green px-6 py-2 font-medium text-sas-white transition-colors hover:bg-sas-black"
                            onClick={() => handleAddNewReviewClick()}
                            ref={targetRef}
                        >
                            {reviewActionLabel}
                        </button>
                    </div>

                    {(isCreatingNew || selectedReview) &&
                        buildingId !== null &&
                        roomNumber && (
                        <div className="mb-8">
                            <ReviewForm
                                review={selectedReview}
                                buildingId={buildingId}
                                roomNumber={roomNumber}
                            />
                        </div>
                    )}

                    {pageError && (
                        <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-800">
                            {pageError}
                        </div>
                    )}
                    {pageMessage && (
                        <div className="mb-5 rounded-md border border-sas-green/30 bg-sas-green/10 px-4 py-3 text-sas-green">
                            {pageMessage}
                        </div>
                    )}

                    <div className="py-4 flex-grow">
                        {roomReviews &&
                        roomReviews.averages &&
                        roomReviews.averages.reviewCount > 0 ? (
                            <>
                                <div className="mb-6 rounded-md border border-sas-line bg-sas-white p-4">
                                    <h4 className="mb-3 font-display text-xl font-semibold text-sas-green">
                                        Summary
                                    </h4>
                                    <div className='inline-flex'>
                                        <p className="text-sas-black/65  py-4 mr-4">
                                            <strong> Occupancy:{' '}
                                                {getRoomOccupancyType(
                                                    roomReviews.room.occupancy_type
                                                )} </strong>
                                        </p>
                                            {roomReviews.room.size && (
                                                <strong><p className="text-sas-black/65 py-4">
                                                    Size: {roomReviews.room.size}{' '}
                                                    sq. ft.
                                                </p> </strong>
                                            )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-sas-black/65">
                                                Overall
                                            </p>
                                            <div className="flex items-center">
                                                <StarRating
                                                    rating={
                                                        roomReviews.averages
                                                            .overallAverage
                                                    }
                                                />
                                                <span className="ml-2">
                                                    {roomReviews.averages.overallAverage.toFixed(
                                                        1
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-sas-black/65">
                                                Quiet
                                            </p>
                                            <div className="flex items-center">
                                                <StarRating
                                                    rating={
                                                        roomReviews.averages
                                                            .quietAverage
                                                    }
                                                />
                                                <span className="ml-2">
                                                    {roomReviews.averages.quietAverage.toFixed(
                                                        1
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-sas-black/65">
                                                Layout
                                            </p>
                                            <div className="flex items-center">
                                                <StarRating
                                                    rating={
                                                        roomReviews.averages
                                                            .layoutAverage
                                                    }
                                                />
                                                <span className="ml-2">
                                                    {roomReviews.averages.layoutAverage.toFixed(
                                                        1
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-sas-black/65">
                                                Temperature
                                            </p>
                                            <div className="flex items-center">
                                                <StarRating
                                                    rating={
                                                        roomReviews.averages
                                                            .temperatureAverage
                                                    }
                                                />
                                                <span className="ml-2">
                                                    {roomReviews.averages.temperatureAverage.toFixed(
                                                        1
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <p className="mt-3 text-sas-black/55">
                                        Based on{' '}
                                        {roomReviews.averages.reviewCount}{' '}
                                        review
                                        {roomReviews.averages.reviewCount !== 1
                                            ? 's'
                                            : ''}
                                    </p>
                                </div>

                                <div className="py-4">
                                    <hr className="border-t border-sas-line" />
                                </div>

                                {/* User Reviews */}
                                <div id="review-list" className="space-y-6">
                                    {paginatedReviews.map((review) => (
                                        <div
                                            key={review._id}
                                            className="border-b border-sas-line pb-4"
                                        >
                                            <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                <div className="flex flex-wrap items-center rounded-md bg-sas-white p-3">
                                                    <span className="text-m mr-2 text-sas-black/65">
                                                        Overall Rating:
                                                    </span>
                                                    <span>
                                                        <StarRating
                                                            rating={
                                                                review.overall_rating ||
                                                                0
                                                            }
                                                        />
                                                    </span>
                                                    <span className="ml-2">
                                                        {review.overall_rating ||
                                                            ''}
                                                    </span>
                                                </div>

                                                {review.isOwner && (
                                                    <div className="flex shrink-0 gap-2 p-2 sm:gap-4">
                                                        <button
                                                            className="text-m rounded-md bg-sas-green px-4 py-2 text-sas-white hover:bg-sas-black"
                                                            onClick={() => {
                                                                setSelectedReview(
                                                                    review
                                                                );
                                                                scrollToReviewForm();
                                                            }}
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            className="text-m rounded-md border border-sas-green px-4 py-2 text-sas-green hover:bg-sas-green hover:text-sas-white"
                                                            onClick={() => {
                                                                setPendingDeleteReviewId(
                                                                    review.id
                                                                );
                                                            }}
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
                                                <div className="text-sm flex items-center mb-2">
                                                    <span className="mr-2 text-sas-black/65">
                                                        Quiet:
                                                    </span>
                                                    <span className="inline">
                                                        <StarRating
                                                            rating={
                                                                review.quiet_rating ||
                                                                0
                                                            }
                                                        />
                                                    </span>
                                                </div>
                                                <div className="text-sm flex items-center mb-1">
                                                    <span className="mr-2 text-sas-black/65">
                                                        Layout:
                                                    </span>
                                                    <span className="inline">
                                                        <StarRating
                                                            rating={
                                                                review.layout_rating ||
                                                                0
                                                            }
                                                        />
                                                    </span>
                                                </div>
                                                <div className="text-sm flex items-center mb-2">
                                                    <span className="mr-2 text-sas-black/65">
                                                        Temperature:
                                                    </span>
                                                    <span className="inline">
                                                        <StarRating
                                                            rating={
                                                                review.temperature_rating ||
                                                                0
                                                            }
                                                        />
                                                    </span>
                                                </div>
                                            </div>

                                            {review.comments && (
                                                <div className="mt-2 mb-2">
                                                    <FormattedReviewText
                                                        text={review.comments}
                                                        className="text-sas-black"
                                                    />
                                                </div>
                                            )}

                                            {/* Date written, last updated */}
                                            <div className="mt-3 flex flex-col gap-1 text-sm text-sas-black/55 sm:flex-row sm:gap-8">
                                                <p>
                                                    Review written{' '}
                                                    {formatDate(
                                                        review.createdAt
                                                    )}
                                                </p>
                                                <p className='ml-auto'>
                                                    Last updated{' '}
                                                    {formatDate(
                                                        review.updatedAt
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <Pagination
                                    page={reviewPage}
                                    totalPages={reviewTotalPages}
                                    onPageChange={setReviewPage}
                                    scrollTargetId="review-list"
                                />
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-40">
                                <p className="text-lg text-sas-black/55">
                                    No reviews yet for this room.
                                </p>
                                <p className="text-sas-black/45">
                                    Be the first to leave a review!
                                </p>
                            </div>
                        )}
                    </div>

                    <button
                        className="mb-6 mt-4 rounded-md border border-sas-green px-6 py-2 font-medium text-sas-green transition-colors hover:bg-sas-green hover:text-sas-white"
                        onClick={() => handleAddNewReviewClick(true)}
                    >
                        {reviewActionLabel}
                    </button>
                </div>
                </div>
                {!isCreatingNew && !selectedReview && (
                    <button
                        type="button"
                        onClick={() => handleAddNewReviewClick(true)}
                        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 right-4 z-30 rounded-md bg-sas-green px-5 py-3 font-medium text-sas-white shadow-lg transition-colors hover:bg-sas-black focus:outline-none focus:ring-2 focus:ring-sas-green focus:ring-offset-2 sm:bottom-6 sm:left-auto sm:right-6"
                    >
                        Add Review
                    </button>
                )}
            </RoomReviewAuthBoundary>
        </div>
    );
};

function RoomReviewAuthBoundary({ children }: { children: ReactNode }) {
    const { user, loading } = useAuth();

    if (loading) {
        return null;
    }

    if (!user) {
        return <LoginRequired />;
    }

    return <>{children}</>;
}

export default RoomPage;
