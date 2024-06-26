import requests
import pathlib
import numpy as np
import torch
import torchvision

def get_buildings_data(num_rows):
    rng = np.random.default_rng(seed=7)
    return {
        "sqft": rng.exponential(scale=1000, size=num_rows),
        "year": rng.integers(low=1995, high=2023, size=num_rows),
        "price": rng.exponential(scale=100_000, size=num_rows),
        "building_type": rng.choice(["A", "B", "C"], size=num_rows)
    }

def download_file(file_url: str, local_file_path: str) -> None:
    local_file = pathlib.Path(local_file_path)
    response = requests.get(file_url)
    if response:
        local_file.write_bytes(response.content)
        print(f"File successfully downloaded and stored at: {local_file_path}")
    else:
        raise requests.exceptions.RequestException(
            f"Failed to download the file. Status code: {response.status_code}"
        )

def get_image_data():
    loader = torch.utils.data.DataLoader(
        torchvision.datasets.MNIST(
            './data/',
            train=False,
            download=True,
            transform=torchvision.transforms.Compose([
            torchvision.transforms.ToTensor(),
            torchvision.transforms.Normalize(
                (0.1307,), (0.3081,))
            ])),
        batch_size=1000,
        shuffle=True
    )
    all_batches = []
    for _, (example_data, _) in enumerate(loader):
        all_batches.append(example_data)
    all_data = torch.stack(all_batches, dim=0)
    return all_data