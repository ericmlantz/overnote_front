import requests

url = "http://127.0.0.1:8000/api/notes"
params = {"context": "example_context"}  # Specify the context parameter

response = requests.get(url, params=params)

# Check the response status and print the results
if response.status_code == 200:
    print("Notes Retrieved Successfully:")
    print(response.json())  # Print the notes in JSON format
else:
    print(f"Failed to fetch notes. Status Code: {response.status_code}")
    print("Response:", response.text)