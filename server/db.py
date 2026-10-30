from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from config import MONGODB_URI

client: AsyncIOMotorClient | None = None
database: AsyncIOMotorDatabase | None = None


async def connect_to_mongo() -> AsyncIOMotorDatabase:
    global client, database
    client = AsyncIOMotorClient(MONGODB_URI)
    try:
        database = client.get_default_database()
    except Exception:
        database = client["mergemind"]
    if database is None:
        database = client["mergemind"]
    return database


async def close_mongo_connection() -> None:
    global client, database
    if client is not None:
        client.close()
        client = None
        database = None


async def get_db() -> AsyncIOMotorDatabase:
    global database
    if database is None:
        database = await connect_to_mongo()
    return database
