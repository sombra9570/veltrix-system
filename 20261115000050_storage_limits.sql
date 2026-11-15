-- 050: candado de almacenamiento (aplicado por SQL): máx. 1 MB por archivo y solo imágenes en todos los buckets
update storage.buckets set file_size_limit = 1048576, allowed_mime_types = array['image/webp','image/jpeg','image/png']
 where id in ('customer-files','chat-files','store-images','billing-proofs');
