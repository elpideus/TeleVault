from app.telegram.client_pool import ClientPool
from app.services.progress import OperationRegistry
from app.services.event_broadcaster import EventBroadcaster

client_pool = ClientPool()
operation_registry = OperationRegistry()
event_broadcaster = EventBroadcaster()

from app.services.upload_queue import UploadWorkerPool

upload_worker_pool = UploadWorkerPool(registry=operation_registry, pool=client_pool)
