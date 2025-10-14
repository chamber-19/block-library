#!/usr/bin/env python3
"""
Test script to verify FastAPI and uvicorn are working locally
"""

try:
    import fastapi
    import uvicorn
    print("✅ FastAPI and uvicorn are available")
    print(f"FastAPI version: {fastapi.__version__}")
    print(f"Uvicorn version: {uvicorn.__version__}")
    
    # Test creating a simple FastAPI app
    from fastapi import FastAPI
    
    app = FastAPI(title="Test API")
    
    @app.get("/")
    def read_root():
        return {"message": "FastAPI is working!"}
    
    @app.get("/health")
    def health_check():
        return {"status": "healthy", "fastapi": fastapi.__version__}
    
    print("✅ FastAPI app created successfully")
    print("To run the test server: uvicorn test_fastapi:app --reload --port 8001")
    
except ImportError as e:
    print(f"❌ Import error: {e}")
    print("Please install FastAPI and uvicorn:")
    print("pip install fastapi uvicorn")
except Exception as e:
    print(f"❌ Error: {e}")

if __name__ == "__main__":
    print("Starting test FastAPI server on port 8001...")
    uvicorn.run(app, host="0.0.0.0", port=8001, reload=True)
