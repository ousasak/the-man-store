<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Symfony\Component\HttpFoundation\Response;

abstract class BaseApiController extends Controller
{
    /**
     * Return a standardized success JSON response.
     */
    public function sendResponse(mixed $result, string $message = 'Success', int $code = Response::HTTP_OK): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => $message,
            'data'    => $result,
        ], $code);
    }

    /**
     * Return a standardized error JSON response.
     */
    public function sendError(string $error, mixed $errorMessages = [], int $code = Response::HTTP_BAD_REQUEST): JsonResponse
    {
        $response = [
            'success' => false,
            'message' => $error,
        ];

        if (!empty($errorMessages)) {
            $response['errors'] = $errorMessages;
        }

        return response()->json($response, $code);
    }

    /**
     * Return a standardized paginated response.
     */
    public function paginatedResponse(LengthAwarePaginator $paginator, string $message = 'Data retrieved successfully'): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => $message,
            'data'    => $paginator->items(),
            'meta'    => [
                'current_page' => $paginator->currentPage(),
                'last_page'    => $paginator->lastPage(),
                'per_page'     => $paginator->perPage(),
                'total'        => $paginator->total(),
                'has_more'     => $paginator->hasMorePages(),
            ],
        ], Response::HTTP_OK);
    }

    /**
     * Return a created (201) response.
     */
    public function sendCreated(mixed $result, string $message = 'Resource created successfully'): JsonResponse
    {
        return $this->sendResponse($result, $message, Response::HTTP_CREATED);
    }

    /**
     * Return a no-content / deleted (200 or 204) response.
     */
    public function sendDeleted(string $message = 'Resource deleted successfully'): JsonResponse
    {
        return $this->sendResponse(null, $message, Response::HTTP_OK);
    }
}
