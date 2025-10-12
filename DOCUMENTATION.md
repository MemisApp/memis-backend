# Memis API Documentation

## 📚 Official Swagger Documentation
**Interactive API Documentation:** [https://memis-backend.onrender.com/swagger](https://memis-backend.onrender.com/swagger)

The Swagger UI provides an interactive interface to test all API endpoints directly in your browser.

---

## 🔐 Authentication

The API uses JWT (JSON Web Token) authentication. Most endpoints require a valid access token in the Authorization header.

**Authorization Header Format:**
```
Authorization: Bearer <your-access-token>
```

### User Roles
- **CAREGIVER**: Family members or healthcare providers who manage patients
- **PATIENT**: Patients who receive care and reminders
- **ADMIN**: System administrators

---

## 🚀 Base URL
```
https://memis-backend.onrender.com
```

---

## 📋 API Endpoints

### 🔑 Authentication Endpoints

#### Register User
```http
POST /auth/register
```

**Request Body:**
```json
{
  "email": "jane.doe@example.com",
  "password": "StrongP@ssw0rd",
  "firstName": "Jane",
  "lastName": "Doe"
}
```

**Response:**
```json
{
  "user": {
    "id": "user-id",
    "email": "jane.doe@example.com",
    "firstName": "Jane",
    "lastName": "Doe",
    "role": "CAREGIVER",
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "accessToken": "jwt-access-token",
  "sessionId": "session-id"
}
```

#### Login User
```http
POST /auth/login
```

**Request Body:**
```json
{
  "email": "caregiver.demo@memis.dev",
  "password": "Memis123!"
}
```

**Response:**
```json
{
  "user": {
    "id": "user-id",
    "email": "caregiver.demo@memis.dev",
    "firstName": "Care",
    "lastName": "Giver",
    "role": "CAREGIVER",
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "accessToken": "jwt-access-token",
  "sessionId": "session-id"
}
```

#### Patient Login (with Pairing Code)
```http
POST /auth/patient-login
```

**Request Body:**
```json
{
  "pairingCode": "ABCD1234",
  "deviceInfo": {
    "platform": "ios",
    "deviceName": "iPhone 12",
    "deviceId": "device-unique-id"
  }
}
```

#### Device Login (Subsequent Logins)
```http
POST /auth/device-login
```

**Request Body:**
```json
{
  "deviceToken": "device-id",
  "pinCode": "1234"
}
```

#### Logout
```http
POST /auth/logout
Authorization: Bearer <access-token>
```

**Request Body:**
```json
{
  "sessionId": "session-id-123"  // Optional: logout specific session
}
```

---

### 🏠 Health Check

#### Health Check
```http
GET /health
```

**Response:**
```json
{
  "ok": true,
  "ts": "2024-01-01T00:00:00.000Z"
}
```

---

### 👥 Patients Management

#### Create Patient Profile
```http
POST /api/patients
Authorization: Bearer <access-token>
```

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Smith",
  "birthDate": "1950-01-01T00:00:00.000Z",
  "avatarUrl": "https://example.com/avatar.jpg",
  "shortIntro": "Loves gardening and reading",
  "maritalDate": "1975-06-15T00:00:00.000Z"
}
```

**Response:**
```json
{
  "patient": {
    "id": "patient-id",
    "firstName": "John",
    "lastName": "Smith",
    "birthDate": "1950-01-01T00:00:00.000Z",
    "avatarUrl": "https://example.com/avatar.jpg",
    "shortIntro": "Loves gardening and reading",
    "maritalDate": "1975-06-15T00:00:00.000Z",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "pairingCode": {
    "id": "pairing-code-id",
    "code": "ABCD1234",
    "expiresAt": "2024-01-02T00:00:00.000Z",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### Get Caregiver's Patients
```http
GET /api/patients
Authorization: Bearer <access-token>
```

**Response:**
```json
[
  {
    "id": "patient-id",
    "firstName": "John",
    "lastName": "Smith",
    "birthDate": "1950-01-01T00:00:00.000Z",
    "avatarUrl": "https://example.com/avatar.jpg",
    "shortIntro": "Loves gardening and reading",
    "maritalDate": "1975-06-15T00:00:00.000Z",
    "caregiverRole": "OWNER",
    "assignedAt": "2024-01-01T00:00:00.000Z",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

#### Get Patient Profile
```http
GET /api/patients/{patientId}
Authorization: Bearer <access-token>
```

#### Update Patient Profile
```http
PUT /api/patients/{patientId}
Authorization: Bearer <access-token>
```

**Request Body:**
```json
{
  "firstName": "John Updated",
  "lastName": "Smith Updated",
  "shortIntro": "Updated bio"
}
```

#### Delete Patient
```http
DELETE /api/patients/{patientId}
Authorization: Bearer <access-token>
```

---

### 🏠 Rooms Management

#### Get User's Rooms (Paginated)
```http
GET /api/rooms?page=1&pageSize=20
Authorization: Bearer <access-token>
```

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `pageSize` (optional): Items per page (default: 20)

**Response:**
```json
{
  "items": [
    {
      "id": "room-id",
      "name": "Family Room",
      "visibility": "PRIVATE",
      "createdById": "user-id",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

#### Get Public Rooms
```http
GET /api/rooms/public?page=1&pageSize=20
Authorization: Bearer <access-token>
```

#### Create Room
```http
POST /api/rooms
Authorization: Bearer <access-token>
```

**Request Body:**
```json
{
  "name": "Family Room",
  "visibility": "PRIVATE"
}
```

#### Get Room by ID
```http
GET /api/rooms/{roomId}
Authorization: Bearer <access-token>
```

#### Update Room
```http
PUT /api/rooms/{roomId}
Authorization: Bearer <access-token>
```

**Request Body:**
```json
{
  "name": "Updated Room Name",
  "visibility": "PUBLIC"
}
```

#### Delete Room
```http
DELETE /api/rooms/{roomId}
Authorization: Bearer <access-token>
```

#### Add Member to Room
```http
POST /api/rooms/{roomId}/members
Authorization: Bearer <access-token>
```

**Request Body:**
```json
{
  "userId": "user-id-to-add",
  "role": "MEMBER"
}
```

#### Get Room Members
```http
GET /api/rooms/{roomId}/members
Authorization: Bearer <access-token>
```

#### Remove Member from Room
```http
DELETE /api/rooms/{roomId}/members/{userId}
Authorization: Bearer <access-token>
```

---

### 💬 Threads Management

#### Get Threads in Room
```http
GET /api/rooms/{roomId}/threads?page=1&pageSize=20
Authorization: Bearer <access-token>
```

#### Create Thread in Room
```http
POST /api/rooms/{roomId}/threads
Authorization: Bearer <access-token>
```

**Request Body:**
```json
{
  "title": "Medication Schedule"
}
```

#### Get Thread by ID
```http
GET /api/threads/{threadId}
Authorization: Bearer <access-token>
```

#### Update Thread
```http
PUT /api/threads/{threadId}
Authorization: Bearer <access-token>
```

**Request Body:**
```json
{
  "title": "Updated Thread Title"
}
```

#### Delete Thread
```http
DELETE /api/threads/{threadId}
Authorization: Bearer <access-token>
```

---

### 📝 Messages Management

#### Get Messages in Thread
```http
GET /api/threads/{threadId}/messages?page=1&pageSize=50
Authorization: Bearer <access-token>
```

#### Create Message in Thread
```http
POST /api/threads/{threadId}/messages
Authorization: Bearer <access-token>
```

**Request Body:**
```json
{
  "content": "Take your medication at 8:00 AM"
}
```

#### Get Message by ID
```http
GET /api/messages/{messageId}
Authorization: Bearer <access-token>
```

#### Update Message
```http
PUT /api/messages/{messageId}
Authorization: Bearer <access-token>
```

**Request Body:**
```json
{
  "content": "Updated message content"
}
```

#### Delete Message
```http
DELETE /api/messages/{messageId}
Authorization: Bearer <access-token>
```

---

### ⏰ Reminders Management

#### Get Patient Reminders
```http
GET /api/patients/{patientId}/reminders
Authorization: Bearer <access-token>
```

#### Create Reminder for Patient
```http
POST /api/patients/{patientId}/reminders
Authorization: Bearer <access-token>
```

**Request Body:**
```json
{
  "type": "PILLS",
  "title": "Morning Medication",
  "notes": "Take with breakfast",
  "schedule": "08:00",
  "isActive": true
}
```

#### Update Reminder
```http
PUT /api/reminders/{reminderId}
Authorization: Bearer <access-token>
```

**Request Body:**
```json
{
  "title": "Updated Reminder Title",
  "isActive": false
}
```

#### Delete Reminder
```http
DELETE /api/reminders/{reminderId}
Authorization: Bearer <access-token>
```

---

### 📱 Devices Management

#### Get Patient Devices
```http
GET /api/patients/{patientId}/devices
Authorization: Bearer <access-token>
```

#### Register Device
```http
POST /api/patients/{patientId}/devices
Authorization: Bearer <access-token>
```

**Request Body:**
```json
{
  "platform": "ios",
  "deviceName": "iPhone 12",
  "devicePublicId": "device-unique-id"
}
```

#### Update Device
```http
PUT /api/devices/{deviceId}
Authorization: Bearer <access-token>
```

#### Delete Device
```http
DELETE /api/devices/{deviceId}
Authorization: Bearer <access-token>
```

---

### 👨‍👩‍👧‍👦 Contacts Management

#### Get Patient Contacts
```http
GET /api/patients/{patientId}/contacts
Authorization: Bearer <access-token>
```

#### Create Contact
```http
POST /api/patients/{patientId}/contacts
Authorization: Bearer <access-token>
```

**Request Body:**
```json
{
  "relation": "CHILD",
  "name": "Jane Smith",
  "phone": "+1234567890",
  "photoUrl": "https://example.com/photo.jpg"
}
```

#### Update Contact
```http
PUT /api/contacts/{contactId}
Authorization: Bearer <access-token>
```

#### Delete Contact
```http
DELETE /api/contacts/{contactId}
Authorization: Bearer <access-token>
```

---

### 🔗 Pairing Codes Management

#### Revoke Pairing Code
```http
DELETE /api/pairing-codes/{codeId}
Authorization: Bearer <access-token>
```

---

## 📊 Response Formats

### Success Response
Most successful operations return the requested data or a success indicator:

```json
{
  "success": true
}
```

### Error Response
Error responses follow this format:

```json
{
  "statusCode": 400,
  "message": "Error description",
  "error": "Bad Request"
}
```

### Common HTTP Status Codes
- **200**: Success
- **201**: Created
- **400**: Bad Request (invalid input)
- **401**: Unauthorized (missing or invalid token)
- **403**: Forbidden (insufficient permissions)
- **404**: Not Found
- **409**: Conflict (duplicate resource)

---

## 🔒 Permission System

### Room Roles
- **OWNER**: Can modify room, add/remove members, delete room
- **MODERATOR**: Can modify room, add/remove members
- **MEMBER**: Can view room and participate in conversations

### Caregiver Roles
- **OWNER**: Full access to patient data and settings
- **EDITOR**: Can modify patient data but not settings
- **VIEWER**: Read-only access to patient data

---

## 📱 Reminder Types

Available reminder types:
- **PILLS**: Medication reminders
- **DOOR_LOCK**: Door locking reminders
- **TEETH**: Dental hygiene reminders
- **PET_CARE**: Pet care reminders
- **CUSTOM**: Custom reminders

---

## 🌐 CORS & Security

The API supports:
- **CORS**: Enabled for all origins with credentials
- **JWT Authentication**: Secure token-based authentication
- **Input Validation**: All inputs are validated and sanitized
- **HTTPS**: All communications are encrypted

---

## 📞 Support

For API support and questions, please refer to the [Swagger Documentation](https://memis-backend.onrender.com/swagger) or contact the development team.

---

*Last updated: January 2024*
