import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpExchange;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

public class website {
    public static void web (String[] args) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(8000), 0);

        server.createContext("/", new website.HelloHandler());

        // 2. NEW: This tells the server how to handle the request for your JS file
        server.createContext("/pdfview.js", new website.JSHandler());

        server.createContext("/pdf.js", new PDFLibHandler());
        // If your pdfview.js is looking for "sample.pdf"
        server.createContext("/pdf.pdf", new PDFFileHandler());
        
        // NEW: Handle CSS files
        server.createContext("/css/style.css", new website.CSSHandler());

        server.createContext("/upload", new website.UploadHandler());
        server.createContext("/save", new website.SaveHandler());

        server.setExecutor(null);

        server.start();
        System.out.println("server staterd MF!!!!");

    }
    static class HelloHandler implements HttpHandler{

        @Override
        public void handle(HttpExchange exchange) throws IOException{

            byte[] response = Files.readAllBytes(Paths.get("src/index.html"));
            //String response = "hello";

            exchange.sendResponseHeaders(200,response.length);

            OutputStream os = exchange.getResponseBody();

            os.write(response);
            os.close();
        }
    }
    // NEW: HANDLER FOR JAVASCRIPT
    static class JSHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            // Make sure pdfview.js is inside your 'src' folder!
            byte[] response = Files.readAllBytes(Paths.get("src/pdfview.js"));

            // IMPORTANT: We tell the browser this is a JavaScript file
            exchange.getResponseHeaders().set("Content-Type", "application/javascript");

            exchange.sendResponseHeaders(200, response.length);
            OutputStream os = exchange.getResponseBody();
            os.write(response);
            os.close();
        }
    }
    static class PDFLibHandler implements HttpHandler {
        public void handle(HttpExchange exchange) throws IOException {
            byte[] response = Files.readAllBytes(Paths.get("src/pdf.js-master/src/pdf.js"));
            exchange.getResponseHeaders().set("Content-Type", "application/javascript");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.getResponseBody().close();
        }
    }
    static class PDFFileHandler implements HttpHandler {
        public void handle(HttpExchange exchange) throws IOException {
            // Change "src/sample.pdf" to whatever your file is actually named!
            byte[] response = Files.readAllBytes(Paths.get("src/pdf.pdf"));

            exchange.getResponseHeaders().set("Content-Type", "application/pdf");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.getResponseBody().close();
        }
    }
    static class UploadHandler implements HttpHandler {
        private static final Path UPLOAD_DIR = Paths.get("src/uploads");

        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!exchange.getRequestMethod().equalsIgnoreCase("POST")) {
                exchange.sendResponseHeaders(405, -1);
                return;
            }

            Files.createDirectories(UPLOAD_DIR);

            InputStream is = exchange.getRequestBody();
            byte[] fileBytes = is.readAllBytes();
            is.close();

            // PDF 헤더 검증 (%PDF)
            if (fileBytes.length < 4 ||
                fileBytes[0] != 0x25 || fileBytes[1] != 0x50 ||
                fileBytes[2] != 0x44 || fileBytes[3] != 0x46) {
                String error = "{\"error\": \"Invalid PDF file\"}";
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(400, error.length());
                exchange.getResponseBody().write(error.getBytes());
                exchange.getResponseBody().close();
                return;
            }

            String filename = "uploaded_" + System.currentTimeMillis() + ".pdf";
            Path savePath = UPLOAD_DIR.resolve(filename);
            Files.write(savePath, fileBytes);

            System.out.println("Received PDF: " + filename + " (" + fileBytes.length + " bytes)");

            String response = "{\"status\": \"ok\", \"filename\": \"" + filename + "\"}";
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            exchange.sendResponseHeaders(200, response.length());
            exchange.getResponseBody().write(response.getBytes());
            exchange.getResponseBody().close();
        }
    }

    static class SaveHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!exchange.getRequestMethod().equalsIgnoreCase("POST")) {
                exchange.sendResponseHeaders(405, -1);
                return;
            }

            InputStream is = exchange.getRequestBody();
            byte[] fileBytes = is.readAllBytes();
            is.close();

            if (fileBytes.length < 4 ||
                fileBytes[0] != 0x25 || fileBytes[1] != 0x50 ||
                fileBytes[2] != 0x44 || fileBytes[3] != 0x46) {
                String error = "{\"error\": \"Invalid PDF file\"}";
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(400, error.length());
                exchange.getResponseBody().write(error.getBytes());
                exchange.getResponseBody().close();
                return;
            }

            Files.write(Paths.get("src/pdf.pdf"), fileBytes);
            System.out.println("Saved PDF: " + fileBytes.length + " bytes");

            String response = "{\"status\": \"ok\"}";
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            exchange.sendResponseHeaders(200, response.length());
            exchange.getResponseBody().write(response.getBytes());
            exchange.getResponseBody().close();
        }
    }

    static class CSSHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            byte[] response = Files.readAllBytes(Paths.get("src/css/style.css"));
            exchange.getResponseHeaders().set("Content-Type", "text/css");
            exchange.sendResponseHeaders(200, response.length);
            OutputStream os = exchange.getResponseBody();
            os.write(response);
            os.close();
        }
    }
}
