# Үг Таа — Render (эсвэл дурын Docker хостинг) дээр ажиллуулах
FROM php:8.2-apache

RUN docker-php-ext-install pdo_mysql \
 && a2enmod rewrite headers expires deflate \
 && sed -ri 's!AllowOverride None!AllowOverride All!g' /etc/apache2/apache2.conf \
 && echo 'ServerName localhost' >> /etc/apache2/apache2.conf \
 && cp "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"

COPY . /var/www/html/
COPY deploy/docker-entrypoint.sh /usr/local/bin/ugtaa-entrypoint

# Vercel-ийн болон туслах файлууд энд хэрэггүй. Windows-оос ирсэн CRLF мөрийн төгсгөлийг засна.
RUN rm -rf /var/www/html/deploy /var/www/html/api /var/www/html/Dockerfile /var/www/html/render.yaml \
           /var/www/html/vercel.json /var/www/html/.vercelignore /var/www/html/.dockerignore \
 && sed -i 's/\r$//' /usr/local/bin/ugtaa-entrypoint \
 && chmod +x /usr/local/bin/ugtaa-entrypoint \
 && chown -R www-data:www-data /var/www/html

# Render-ийн proxy-ийн ард ажиллана → хэрэглэгчийн жинхэнэ IP-г X-Forwarded-For-оос авна
ENV BEHIND_PROXY=1 PORT=10000
EXPOSE 10000
CMD ["ugtaa-entrypoint"]
